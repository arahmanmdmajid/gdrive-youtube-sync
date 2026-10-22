import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import fs from "node:fs";
import { streamDriveFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import { buildYoutubeTitle, buildYoutubeDescription } from "./schedule";
import { prepareAudioForYoutube } from "./audioMux";
import { extractSerial, getSubjectThumbnailPath } from "./thumbnails";
import { logger } from "./logger";
import { claimPendingJob, markJobDone, uploadBlockReason } from "./jobClaims";
import { markUploadActive, markUploadInactive, performUpload, UploadNotRecordedError } from "./uploadRecovery";
import { withDecisionLog } from "./decisions";
import { isTransient, isAuthError, isQuotaError, QuotaExceededError, findVideoOnYoutube, withRetry } from "./youtubeMatch";

/**
 * Core upload logic — shared by processNextPendingJob, processJobById and processAllPendingJobs.
 * The job is claimed first (pending -> processing in one conditional update). If it is no longer
 * pending (undone, rejected, claimed by another caller) nothing is uploaded and this returns false.
 * The claimed row, not the caller's copy, is used from here on, so a title edited after the
 * caller read the job is the title that gets uploaded.
 */
async function uploadJob(queued: typeof jobsTable.$inferSelect): Promise<boolean> {
  const job = await claimPendingJob(queued.id);
  if (!job) {
    logger.info({ jobId: queued.id }, "Job is no longer pending — skipping upload");
    return false;
  }

  markUploadActive(job.id);
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const youtube = getYoutubeClient();

    if (!youtube) {
      throw new Error("YouTube not configured. Please add OAuth credentials.");
    }

    const title = job.proposedTitle ?? (await buildYoutubeTitle(job.driveFileName, job.driveCreatedTime));
    const description = job.proposedDescription ?? (await buildYoutubeDescription(job.driveFileName, job.driveCreatedTime));

    // Last check before anything is sent: an empty title, or the same title already uploaded by
    // another job. Back to review with the reason, so a person decides and the worker does not retry.
    const blocked = await uploadBlockReason(job.id, title);
    if (blocked) {
      logger.warn({ jobId: job.id, title, blocked }, "Upload blocked before sending — returning job to review");
      await withDecisionLog({ eventType: "upload_blocked", actor: "system", subjectId: job.id }, async () => {
        await db.update(jobsTable)
          .set({ status: "needs_review", errorMessage: blocked, updatedAt: new Date() })
          .where(eq(jobsTable.id, job.id));
      });
      return false;
    }

    logger.info({ jobId: job.id, title, contentType: job.contentType }, "Starting upload to YouTube");

    // Audio jobs have no video stream of their own — mux the source audio
    // with a per-subject thumbnail (or a solid-color fallback frame) into
    // an mp4 first, since YouTube's upload API doesn't reliably accept
    // audio-only files.
    const audioMux = job.contentType === "audio"
      ? await prepareAudioForYoutube(job.driveFileId, title)
      : null;

    let outcome;
    try {
      // Looks for an existing upload first, every time, then adopts it, waits for it or uploads, and
      // records the result with retries. The video is marked done before the best-effort playlist
      // and thumbnail steps below. See uploadRecovery.ts.
      outcome = await performUpload(
        { id: job.id, title, description },
        {
          youtube,
          openStream: async () => (audioMux ? fs.createReadStream(audioMux.mp4Path) : await streamDriveFile(job.driveFileId)),
          write: markJobDone,
        },
      );
    } finally {
      if (audioMux) await audioMux.cleanup();
    }

    if (outcome.kind === "waiting") {
      // A same-titled upload is still processing on YouTube, possibly this job's own earlier attempt.
      // Back to pending (not failed) so the next tick looks again. Nothing was sent.
      await db.update(jobsTable)
        .set({ status: "pending", errorMessage: "Waiting for an earlier upload with this title to finish processing on YouTube", updatedAt: new Date() })
        .where(eq(jobsTable.id, job.id));
      return false;
    }
    const videoId = outcome.videoId;

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
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // The video is on YouTube but the database would not record it. Leave the job processing (never
    // failed: a retry would upload a second copy). It is finished from the saved video id, see
    // retryUnrecorded in the worker tick.
    if (err instanceof UploadNotRecordedError) return true;

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
          return true;
        }
      } catch (recoverErr) {
        logger.warn({ jobId: job.id, recoverErr }, "Recovery check failed — marking job as failed");
      }
    }

    await db.update(jobsTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));
    return true;
  } finally {
    markUploadInactive(job.id);
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
        // Each job is claimed on its own, so a job that left pending since the list was read is skipped.
        if (await uploadJob(job)) processed++;
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
