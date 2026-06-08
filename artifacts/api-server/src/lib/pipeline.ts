import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { getDriveClient, streamDriveFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import {
  buildYoutubeTitle,
  buildYoutubeDescription,
  buildYoutubeDescriptionFromSlot,
  extractMeetingCode,
  getOrderedSlotsForDay,
  getPktInfo,
} from "./schedule";
import { isEligible, BATCH_RECORDING_SIZE_BYTES } from "./filter";
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
function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota exceeded|quotaExceeded|rateLimitExceeded/i.test(msg);
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

export async function runPipelineScan(): Promise<{
  newJobsCreated: number;
  alreadyQueued: number;
  totalScanned: number;
  filtered: number;
}> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.driveFolderId) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  const drive = getDriveClient();
  if (!drive) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  let allFiles: Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${settings.driveFolderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime)",
      orderBy: "createdTime asc",
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    const page = (response.data.files ?? []) as typeof allFiles;
    allFiles = allFiles.concat(page);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const totalScanned = allFiles.length;

  const eligible = allFiles.filter(
    (f) => f.id && f.name && isEligible(f.name, f.createdTime)
  );
  const filtered = totalScanned - eligible.length;

  // ── Positional slot assignment ────────────────────────────────────────────
  // Group files by (PKT date, meeting code), sort each group by createdTime
  // ascending, then assign schedule slots positionally:
  //   position 0 → first slot of the day, position 1 → second slot, etc.
  // This is timezone-safe: the schedule is in PKT; we shift UTC→PKT before
  // extracting the date and day-of-week, so a KSA-recorded file that crosses
  // a UTC midnight still lands on the correct PKT calendar day.

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
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
    );
  }

  // Map driveFileId → { title, description } for every eligible file
  const positionalAssignments = new Map<string, { title: string; description: string }>();
  for (const group of groupMap.values()) {
    const slots = group.meetingCode ? getOrderedSlotsForDay(group.dayOfWeek) : [];
    for (let i = 0; i < group.files.length; i++) {
      const file = group.files[i];
      if (!file.id) continue;
      const slot = slots[i];
      if (slot) {
        positionalAssignments.set(file.id, {
          title: `${slot.subject} | ${slot.teacher} | ${group.pktDateStr}`,
          description: buildYoutubeDescriptionFromSlot(slot, group.pktDateStr, file.name ?? file.id),
        });
      } else {
        // Overflow (more recordings than schedule slots) or no meeting code
        positionalAssignments.set(file.id, {
          title: buildYoutubeTitle(file.name ?? "Untitled", file.createdTime),
          description: buildYoutubeDescription(file.name ?? "Untitled", file.createdTime),
        });
      }
    }
  }

  // ── Load existing jobs ────────────────────────────────────────────────────
  const existingJobs = await db
    .select({ id: jobsTable.id, driveFileId: jobsTable.driveFileId, status: jobsTable.status })
    .from(jobsTable);
  const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));

  // ── Re-title existing needs_review jobs with corrected positional names ───
  // These haven't been approved yet so it's safe to overwrite their proposed title.
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
        title: buildYoutubeTitle(file.name ?? "Untitled", file.createdTime ?? null),
        description: buildYoutubeDescription(file.name ?? "Untitled", file.createdTime ?? null),
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

    const title = job.proposedTitle ?? buildYoutubeTitle(job.driveFileName, job.driveCreatedTime);
    const description = job.proposedDescription ?? buildYoutubeDescription(job.driveFileName, job.driveCreatedTime);

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

    logger.info({ jobId: job.id, title }, "Starting upload to YouTube");

    const fileStream = await streamDriveFile(job.driveFileId);

    const uploadResponse = await withRetry(() =>
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

    const videoId = uploadResponse.data.id ?? "";
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Save video as done first — playlist insertion is best-effort
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
          job.proposedTitle ?? buildYoutubeTitle(job.driveFileName, job.driveCreatedTime);
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
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        logger.warn("Pipeline worker: daily quota reached, skipping until next tick");
        return;
      }
      logger.error({ err }, "Pipeline worker error");
    }
  }, 60_000);
  logger.info("Pipeline worker started");
}
