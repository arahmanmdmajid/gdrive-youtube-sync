import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import fs from "node:fs";
import { streamDriveFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import { buildYoutubeTitle, buildYoutubeDescription } from "./schedule";
import { prepareAudioForYoutube } from "./audioMux";
import { extractSerial, getSubjectThumbnailPath } from "./thumbnails";
import { logger } from "./logger";
import { isTransient, isAuthError, isQuotaError, QuotaExceededError, findVideoOnYoutube, withRetry } from "./youtubeMatch";

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
      const match = await findVideoOnYoutube(youtube, title);
      if (match && !match.complete) {
        logger.warn(
          { jobId: job.id, videoId: match.videoId },
          "Found a same-titled but incomplete upload — ignoring it and uploading again",
        );
      }
      if (match?.complete) {
        const existingId = match.videoId;
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
        const match = await findVideoOnYoutube(youtube, title);
        if (match?.complete) {
          const existingId = match.videoId;
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
