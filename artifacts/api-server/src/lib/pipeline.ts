import { db, jobsTable, settingsTable, driveSourceFoldersTable } from "@workspace/db";
import { eq, asc, isNotNull } from "drizzle-orm";
import fs from "node:fs";
import { getDriveClient, streamDriveFile, listChildren, FOLDER_MIME_TYPE, type DriveChildFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import {
  buildYoutubeTitle,
  buildYoutubeDescription,
  buildYoutubeDescriptionFromSlot,
  buildYoutubeTitleFromSlot,
  extractMeetingCode,
  getOrderedSlotsForDay,
  getPktInfo,
} from "./schedule";
import { isEligible, BATCH_RECORDING_SIZE_BYTES } from "./filter";
import { prepareAudioForYoutube } from "./audioMux";
import { extractSerial, getSubjectThumbnailPath } from "./thumbnails";
import { logger } from "./logger";

/** Returns true for errors that are worth retrying (DNS blip, socket reset, timeout). */
function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|network/i.test(msg);
}

/** Returns true if the error message looks like an OAuth / token failure. */
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /token|oauth|auth|getaddrinfo/i.test(msg);
}

/** Returns true if the error is a YouTube quota exceeded error. */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota exceeded|quotaExceeded|rateLimitExceeded|exceeded your.*quota|exceeded.*quota/i.test(msg);
}

/**
 * Returns true if the error is YouTube's per-account thumbnail-upload rate
 * limit ("too many thumbnails recently") — separate from the daily upload
 * quota, undocumented reset window, worth its own detection so bulk
 * thumbnail application can stop cleanly instead of failing every
 * remaining job in the batch.
 */
export function isThumbnailRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /too many thumbnails/i.test(msg);
}

/**
 * Thrown by uploadJob when YouTube's daily upload quota is hit.
 * processAllPendingJobs catches this to stop the batch immediately.
 */
class QuotaExceededError extends Error {
  constructor() {
    super("YouTube daily upload quota exceeded — remaining jobs left as pending for tomorrow");
    this.name = "QuotaExceededError";
  }
}

/**
 * Search the authenticated YouTube channel for a video whose title exactly
 * matches `title`. Returns the videoId if found, null otherwise.
 * Uses the cheap videos.list on the channel's uploads playlist — avoids
 * the expensive search.list quota cost.
 */
async function findVideoOnYoutube(
  youtube: ReturnType<typeof getYoutubeClient>,
  title: string,
): Promise<string | null> {
  if (!youtube) return null;
  try {
    // Step 1: get the channel's uploads playlist ID (1 unit)
    const channelRes = await youtube.channels.list({
      part: ["contentDetails"],
      mine: true,
    });
    const uploadsPlaylistId =
      channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return null;

    // Step 2: page through recent uploads looking for an exact title match
    // Each playlistItems.list call costs 1 unit; we check up to 3 pages (150 items)
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const itemsRes = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of itemsRes.data.items ?? []) {
        if (item.snippet?.title === title) {
          const videoId = item.snippet.resourceId?.videoId;
          if (videoId) return videoId;
        }
      }
      pageToken = itemsRes.data.nextPageToken ?? undefined;
      pages++;
    } while (pageToken && pages < 3);
  } catch (err) {
    logger.warn({ err }, "findVideoOnYoutube: search failed");
  }
  return null;
}

/** Retry an async fn up to maxAttempts times with exponential back-off. */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn({ attempt, delay, err }, "Transient error — retrying");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Collects candidate video files from a Drive source folder, handling both
 * layouts Google Meet has used: files landing directly in the folder (flat),
 * and — more recently — one subfolder per persistent meeting code (nested),
 * which also mixes in "Notes by Gemini" docs and chat-transcript text files
 * alongside the recordings (harmless — the video mimeType filter excludes
 * them). Only descends into subfolders whose name starts with a known class
 * meeting code; every other subfolder is an unrelated Meet call swept into
 * the same account-wide auto-save folder and is left alone.
 */
async function collectVideoFiles(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  folderId: string,
): Promise<DriveChildFile[]> {
  const direct = await listChildren(drive, folderId, "mimeType contains 'video/'");
  const subfolders = await listChildren(drive, folderId, `mimeType = '${FOLDER_MIME_TYPE}'`);
  const matched = subfolders.filter((f) => extractMeetingCode(f.name) !== null);
  const nested = await Promise.all(
    matched.map((f) => listChildren(drive, f.id, "mimeType contains 'video/'")),
  );
  return [...direct, ...nested.flat()];
}

export async function runPipelineScan(): Promise<{
  newJobsCreated: number;
  alreadyQueued: number;
  totalScanned: number;
  filtered: number;
}> {
  const sourceFolders = await db.select().from(driveSourceFoldersTable);
  if (sourceFolders.length === 0) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  const drive = getDriveClient();
  if (!drive) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  let allFiles: DriveChildFile[] = [];
  for (const folder of sourceFolders) {
    allFiles = allFiles.concat(await collectVideoFiles(drive, folder.folderId));
  }

  const totalScanned = allFiles.length;

  const eligible = allFiles.filter(
    (f) => f.id && f.name && isEligible(f.name, f.createdTime)
  );
  const filtered = totalScanned - eligible.length;

  // ── Load existing jobs ────────────────────────────────────────────────────
  const existingJobs = await db
    .select({
      id: jobsTable.id,
      driveFileId: jobsTable.driveFileId,
      status: jobsTable.status,
      proposedTitle: jobsTable.proposedTitle,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
    })
    .from(jobsTable);
  const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));
  const existingByFileId = new Map(existingJobs.map((j) => [j.driveFileId, j]));

  // ── Positional slot assignment ────────────────────────────────────────────
  // Group files by (PKT date, meeting code), sort each group by createdTime
  // ascending, then assign schedule slots positionally:
  //   position 0 → first available slot of the day, position 1 → next, etc.
  // This is timezone-safe: the schedule is in PKT; we shift UTC→PKT before
  // extracting the date and day-of-week, so a KSA-recorded file that crosses
  // a UTC midnight still lands on the correct PKT calendar day.
  //
  // "Available" excludes slot names already manually confirmed for that day
  // (lectureNameConfirmed) — those jobs are left untouched entirely, and their
  // slot is removed from the pool so nothing else gets auto-suggested the same
  // name. Non-confirmed files (new or previously auto-guessed) draw positionally
  // from whatever's left, same as before.

  type GroupEntry = {
    pktDateStr: string;
    dayOfWeek: number;
    meetingCode: string | null;
    files: typeof eligible;
  };
  const groupMap = new Map<string, GroupEntry>();
  for (const file of eligible) {
    if (!file.createdTime) continue;
    const { dateStr, dayOfWeek } = getPktInfo(file.createdTime);
    const meetingCode = extractMeetingCode(file.name ?? "");
    const key = `${dateStr}||${meetingCode ?? "none"}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { pktDateStr: dateStr, dayOfWeek, meetingCode, files: [] });
    }
    groupMap.get(key)!.files.push(file);
  }
  for (const group of groupMap.values()) {
    group.files.sort(
      (a, b) => new Date(a.createdTime ?? 0).getTime() - new Date(b.createdTime ?? 0).getTime()
    );
  }

  // Map driveFileId → { title, description } for every eligible, non-confirmed file
  const positionalAssignments = new Map<string, { title: string; description: string }>();
  for (const group of groupMap.values()) {
    const allSlots = group.meetingCode ? await getOrderedSlotsForDay(group.dayOfWeek) : [];

    const confirmedTitles = new Set(
      group.files
        .map((f) => (f.id ? existingByFileId.get(f.id) : undefined))
        .filter((j) => j?.lectureNameConfirmed)
        .map((j) => j!.proposedTitle),
    );
    const availableSlots = allSlots.filter(
      (slot) => !confirmedTitles.has(buildYoutubeTitleFromSlot(slot, group.pktDateStr)),
    );

    let nextSlotIdx = 0;
    for (const file of group.files) {
      if (!file.id) continue;
      const existing = existingByFileId.get(file.id);
      if (existing?.lectureNameConfirmed) continue; // manually confirmed — leave untouched

      const slot = availableSlots[nextSlotIdx];
      if (slot) {
        nextSlotIdx++;
        positionalAssignments.set(file.id, {
          title: buildYoutubeTitleFromSlot(slot, group.pktDateStr),
          description: buildYoutubeDescriptionFromSlot(slot, group.pktDateStr, file.name ?? file.id),
        });
      } else {
        // Overflow (more recordings than remaining schedule slots) or no meeting code
        positionalAssignments.set(file.id, {
          title: await buildYoutubeTitle(file.name ?? "Untitled", file.createdTime),
          description: await buildYoutubeDescription(file.name ?? "Untitled", file.createdTime),
        });
      }
    }
  }

  // ── Re-title existing needs_review jobs with corrected positional names ───
  // Manually confirmed jobs have no entry in positionalAssignments (see above)
  // and are skipped here, so a rescan never undoes an admin's correction.
  for (const existing of existingJobs) {
    if (existing.status !== "needs_review") continue;
    const assignment = positionalAssignments.get(existing.driveFileId);
    if (!assignment) continue;
    await db
      .update(jobsTable)
      .set({ proposedTitle: assignment.title, proposedDescription: assignment.description, updatedAt: new Date() })
      .where(eq(jobsTable.id, existing.id));
  }

  let newJobsCreated = 0;
  let alreadyQueued = 0;

  for (const file of eligible) {
    if (!file.id) continue;
    if (queuedIds.has(file.id)) {
      alreadyQueued++;
    } else {
      const sizeBytes = file.size ? parseInt(file.size, 10) : null;
      const isSuspiciousSize = sizeBytes !== null && sizeBytes > BATCH_RECORDING_SIZE_BYTES;
      const assignment = positionalAssignments.get(file.id) ?? {
        title: await buildYoutubeTitle(file.name ?? "Untitled", file.createdTime ?? null),
        description: await buildYoutubeDescription(file.name ?? "Untitled", file.createdTime ?? null),
      };
      let proposedTitle = assignment.title;
      const proposedDescription = assignment.description;
      if (isSuspiciousSize) {
        proposedTitle = `[REVIEW: large file] ${proposedTitle}`;
      }
      await db.insert(jobsTable).values({
        driveFileId: file.id,
        driveFileName: file.name ?? "Untitled",
        driveFileSizeBytes: sizeBytes,
        driveCreatedTime: file.createdTime ?? null,
        status: "needs_review",
        proposedTitle,
        proposedDescription,
      });
      newJobsCreated++;
    }
  }

  return { newJobsCreated, alreadyQueued, totalScanned, filtered };
}

/**
 * Core upload logic — shared by both processNextPendingJob and processJobById.
 * The job must already exist and be in "pending" status before calling this.
 */
async function uploadJob(job: typeof jobsTable.$inferSelect): Promise<void> {
  await db.update(jobsTable)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(jobsTable.id, job.id));

  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const youtube = getYoutubeClient();

    if (!youtube) {
      throw new Error("YouTube not configured. Please add OAuth credentials.");
    }

    const title = job.proposedTitle ?? (await buildYoutubeTitle(job.driveFileName, job.driveCreatedTime));
    const description = job.proposedDescription ?? (await buildYoutubeDescription(job.driveFileName, job.driveCreatedTime));

    // ── Dedup check ──────────────────────────────────────────────────────────
    // If this job previously failed with a network/auth error, the video may
    // have already been uploaded to YouTube but the response was lost. Check
    // before uploading to avoid creating a duplicate.
    if (job.errorMessage && (isTransient({ message: job.errorMessage } as Error) || isAuthError({ message: job.errorMessage } as Error))) {
      logger.info({ jobId: job.id, title }, "Previous auth/network failure — checking YouTube for existing upload");
      const existingId = await findVideoOnYoutube(youtube, title);
      if (existingId) {
        logger.info({ jobId: job.id, existingId }, "Video already exists on YouTube — marking as done without re-uploading");
        await db.update(jobsTable)
          .set({
            status: "done",
            youtubeVideoId: existingId,
            youtubeUrl: `https://www.youtube.com/watch?v=${existingId}`,
            youtubeTitle: title,
            updatedAt: new Date(),
          })
          .where(eq(jobsTable.id, job.id));
        return;
      }
    }

    logger.info({ jobId: job.id, title, contentType: job.contentType }, "Starting upload to YouTube");

    // Audio jobs have no video stream of their own — mux the source audio
    // with a per-subject thumbnail (or a solid-color fallback frame) into
    // an mp4 first, since YouTube's upload API doesn't reliably accept
    // audio-only files.
    const audioMux = job.contentType === "audio"
      ? await prepareAudioForYoutube(job.driveFileId, title)
      : null;

    let uploadResponse;
    try {
      const fileStream = audioMux
        ? fs.createReadStream(audioMux.mp4Path)
        : await streamDriveFile(job.driveFileId);

      uploadResponse = await withRetry(() =>
        youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: { title, description },
            status: { privacyStatus: "unlisted" },
          },
          media: {
            mimeType: "video/mp4",
            body: fileStream,
          },
        })
      );
    } finally {
      if (audioMux) await audioMux.cleanup();
    }

    const videoId = uploadResponse.data.id ?? "";
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Save video as done first — playlist insertion and thumbnail are best-effort
    await db.update(jobsTable)
      .set({
        status: "done",
        youtubeVideoId: videoId,
        youtubeUrl,
        youtubeTitle: title,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, job.id));

    if (settings?.youtubePlaylistId && videoId) {
      try {
        await withRetry(() =>
          youtube.playlistItems.insert({
            part: ["snippet"],
            requestBody: {
              snippet: {
                playlistId: settings.youtubePlaylistId!,
                resourceId: { kind: "youtube#video", videoId },
              },
            },
          })
        );
      } catch (playlistErr) {
        // Playlist insert failed — video is uploaded but not in playlist.
        // Log as warning but keep job status as "done".
        logger.warn({ jobId: job.id, videoId, playlistErr }, "Video uploaded but playlist insert failed");
      }
    }

    // Video jobs get an explicit per-subject thumbnail (audio's frame is
    // already baked into the muxed mp4, so it doesn't need this step).
    if (job.contentType !== "audio" && videoId) {
      const serial = extractSerial(title);
      const thumbPath = serial ? getSubjectThumbnailPath(serial) : null;
      if (thumbPath) {
        try {
          await withRetry(() =>
            youtube.thumbnails.set({
              videoId,
              media: { body: fs.createReadStream(thumbPath) },
            })
          );
        } catch (thumbErr) {
          logger.warn({ jobId: job.id, videoId, thumbErr }, "Video uploaded but thumbnail set failed");
        }
      }
    }

    logger.info({ jobId: job.id, videoId, title }, "Job completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // ── Quota exceeded: reset to pending and stop the batch ──────────────────
    if (isQuotaError(err)) {
      logger.warn({ jobId: job.id }, "YouTube upload quota exceeded — resetting job to pending");
      await db.update(jobsTable)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(jobsTable.id, job.id));
      throw new QuotaExceededError();
    }

    logger.error({ jobId: job.id, err }, "Job failed — checking YouTube before marking as failed");

    // If the failure looks like a network/auth error, the video may have been
    // received by YouTube even though the client threw. Try to recover.
    if (isTransient(err) || isAuthError(err)) {
      try {
        const youtube = getYoutubeClient();
        const title =
          job.proposedTitle ?? (await buildYoutubeTitle(job.driveFileName, job.driveCreatedTime));
        const existingId = await findVideoOnYoutube(youtube, title);
        if (existingId) {
          logger.info({ jobId: job.id, existingId }, "Video found on YouTube after error — recovering as done");
          const [settings] = await db.select().from(settingsTable).limit(1);
          await db.update(jobsTable)
            .set({
              status: "done",
              youtubeVideoId: existingId,
              youtubeUrl: `https://www.youtube.com/watch?v=${existingId}`,
              youtubeTitle: title,
              updatedAt: new Date(),
            })
            .where(eq(jobsTable.id, job.id));

          // Best-effort playlist add for the recovered video
          if (settings?.youtubePlaylistId) {
            try {
              const yt = getYoutubeClient();
              await yt?.playlistItems.insert({
                part: ["snippet"],
                requestBody: {
                  snippet: {
                    playlistId: settings.youtubePlaylistId,
                    resourceId: { kind: "youtube#video", videoId: existingId },
                  },
                },
              });
            } catch (_) { /* non-fatal */ }
          }
          return;
        }
      } catch (recoverErr) {
        logger.warn({ jobId: job.id, recoverErr }, "Recovery check failed — marking job as failed");
      }
    }

    await db.update(jobsTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));
  }
}

/**
 * Picks the oldest pending job (by driveCreatedTime) and uploads it.
 * Strictly chronological so playlist order stays correct.
 */
export async function processNextPendingJob() {
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.status, "pending"))
    .orderBy(asc(jobsTable.driveCreatedTime))
    .limit(1);

  if (!job) return null;
  await uploadJob(job);
  return job.id;
}

/**
 * Two-way sync between the configured YouTube playlist and the jobs table.
 * No-ops if no playlist is configured. Single paginated playlist fetch, no
 * per-job API calls.
 *
 * - Marks a "done" job "removed" if its video left the playlist.
 * - Self-heals a "removed" job back to "done" if its video reappeared.
 * - Inserts a new "manual"-source "done" job for any playlist video with no
 *   job at all (e.g. uploaded outside the pipeline).
 */
export async function reconcilePlaylist(): Promise<{ removed: number[]; restored: number[]; inserted: number[] }> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.youtubePlaylistId) return { removed: [], restored: [], inserted: [] };

  const youtube = getYoutubeClient();
  if (!youtube) return { removed: [], restored: [], inserted: [] };

  const playlistItems = new Map<string, { title: string; publishedAt: string | null }>();
  let pageToken: string | undefined;
  do {
    const res = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: settings.youtubePlaylistId,
      maxResults: 50,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of res.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      const title = item.snippet?.title;
      if (!videoId || !title || title === "Deleted video" || title === "Private video") continue;
      playlistItems.set(videoId, {
        title,
        publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const existingJobs = await db
    .select({ id: jobsTable.id, status: jobsTable.status, youtubeVideoId: jobsTable.youtubeVideoId })
    .from(jobsTable)
    .where(isNotNull(jobsTable.youtubeVideoId));
  const jobsByVideoId = new Map(existingJobs.map((j) => [j.youtubeVideoId as string, j]));

  const removed: number[] = [];
  const restored: number[] = [];
  const inserted: number[] = [];

  for (const job of existingJobs) {
    if (!job.youtubeVideoId) continue;
    const inPlaylist = playlistItems.has(job.youtubeVideoId);
    if (job.status === "done" && !inPlaylist) {
      await db.update(jobsTable).set({ status: "removed", updatedAt: new Date() }).where(eq(jobsTable.id, job.id));
      removed.push(job.id);
    } else if (job.status === "removed" && inPlaylist) {
      await db.update(jobsTable).set({ status: "done", updatedAt: new Date() }).where(eq(jobsTable.id, job.id));
      restored.push(job.id);
    }
  }

  for (const [videoId, item] of playlistItems) {
    if (jobsByVideoId.has(videoId)) continue;
    const [newJob] = await db
      .insert(jobsTable)
      .values({
        driveFileId: `manual:${videoId}`,
        driveFileName: item.title,
        driveCreatedTime: item.publishedAt,
        status: "done",
        source: "manual",
        proposedTitle: item.title,
        youtubeVideoId: videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        youtubeTitle: item.title,
      })
      .returning({ id: jobsTable.id });
    if (newJob) inserted.push(newJob.id);
  }

  if (removed.length || restored.length || inserted.length) {
    logger.warn({ removed, restored, inserted }, "Playlist reconciliation completed");
  }

  return { removed, restored, inserted };
}

/**
 * Uploads a specific job by its DB id.
 * Returns false if the job doesn't exist or isn't pending.
 */
export async function processJobById(id: number): Promise<boolean> {
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, id));

  if (!job || job.status !== "pending") return false;
  // Run in background — caller gets immediate response
  setImmediate(() => uploadJob(job).catch((err) => logger.error({ jobId: id, err }, "Background upload error")));
  return true;
}

/**
 * Module-level lock: true while a processAllPendingJobs run is in progress.
 * Prevents concurrent batch uploads triggered by multiple button clicks or
 * simultaneous pipeline-worker ticks.
 */
let _batchRunning = false;

/**
 * Uploads ALL pending jobs in chronological order, one at a time.
 * Returns the number of jobs processed, or -1 if a batch was already running.
 * Meant to be called and awaited in the background — each upload runs to completion
 * before the next begins, preserving playlist order.
 */
export async function processAllPendingJobs(): Promise<number> {
  if (_batchRunning) {
    logger.warn("processAllPendingJobs: batch already running — skipping duplicate call");
    return -1;
  }
  _batchRunning = true;
  try {
    const pending = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.status, "pending"))
      .orderBy(asc(jobsTable.driveCreatedTime));

    let processed = 0;
    for (const job of pending) {
      try {
        await uploadJob(job);
        processed++;
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          logger.warn({ processed, remaining: pending.length - processed }, "Upload batch stopped: daily quota reached");
          break;
        }
        logger.error({ jobId: job.id, err }, "processAllPendingJobs: job failed, continuing with next");
      }
    }

    return processed;
  } finally {
    _batchRunning = false;
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startPipelineWorker() {
  if (workerInterval) return;
  workerInterval = setInterval(async () => {
    try {
      const [settings] = await db.select().from(settingsTable).limit(1);
      if (!settings?.autoSync) return;
      await runPipelineScan();
      await processNextPendingJob();
      await reconcilePlaylist();
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        logger.warn("Pipeline worker: daily quota reached, skipping until next tick");
        return;
      }
      logger.error({ err }, "Pipeline worker error");
    }
  }, Number(process.env.WORKER_TICK_MS ?? 60_000));
  logger.info("Pipeline worker started");
}
