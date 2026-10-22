import { db, settingsTable } from "@workspace/db";
import { logger } from "./logger";
import { runPipelineScan } from "./scan";
import { processNextPendingJob } from "./upload";
import { reconcilePlaylist } from "./reconcile";
import { reclaimOrphanedJobs } from "./reclaim";
import { QuotaExceededError } from "./youtubeMatch";
import { getYoutubeClient } from "./youtubeClient";
import { markJobDone } from "./jobClaims";
import { runAutoReview } from "./autoReviewRun";
import { runTeacherStep } from "./teacherStep";
import { sweepTileFolders } from "./teacherReader";
import { activeUploadJobIds, retryUnrecorded, unrecordedJobIds } from "./uploadRecovery";

let workerInterval: ReturnType<typeof setInterval> | null = null;

// A job that sat in processing this long, that this process is not uploading and does not hold a
// video id for, has been stranded (for example a failed-job write that also failed).
const STRANDED_AFTER_MS = 15 * 60 * 1000;

/**
 * Finishes uploads that YouTube accepted but the database would not record (by saved video id),
 * then sweeps jobs stranded in processing without waiting for a restart.
 */
async function recoverUploads(playlistId: string | null): Promise<void> {
  const finished = await retryUnrecorded(markJobDone);
  const youtube = getYoutubeClient();
  if (youtube && playlistId) {
    // The playlist insert normally follows the done write, so a job finished here is not in the
    // playlist yet, and reconcile would later mark a done job that is not in the playlist removed.
    for (const { jobId, videoId } of finished) {
      try {
        await youtube.playlistItems.insert({
          part: ["snippet"],
          requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
        });
      } catch (err) {
        logger.warn({ jobId, videoId, err }, "Recovered an upload but the playlist insert failed");
      }
    }
  }
  await reclaimOrphanedJobs({
    excludeIds: [...activeUploadJobIds(), ...unrecordedJobIds()],
    minAgeMs: STRANDED_AFTER_MS,
  });
}

export function startPipelineWorker() {
  if (workerInterval) return;

  // Sweep before the first tick so a job orphaned by the previous process is
  // resolved rather than sitting invisible until someone notices it by hand.
  // Frame folders left by a read that was cut short by a crash or a restart (real faces: never leave them).
  void sweepTileFolders().catch(() => undefined);

  void reclaimOrphanedJobs().catch((err) => {
    logger.error({ err }, "reclaimOrphanedJobs failed at startup");
  });

  workerInterval = setInterval(async () => {
    try {
      const [settings] = await db.select().from(settingsTable).limit(1);
      if (!settings?.autoSync) return;
      try {
        await recoverUploads(settings.youtubePlaylistId);
      } catch (err) {
        // Recovery must never stop the scan and uploads from running.
        logger.error({ err }, "Upload recovery failed");
      }
      await runPipelineScan();
      try {
        // Dry run of the day-approval rules: records verdicts, changes no job. Off unless AUTO_REVIEW_MODE=dry_run.
        await runAutoReview();
      } catch (err) {
        // Never stops the uploads.
        logger.error({ err }, "Auto-review dry run failed");
      }
      try {
        await processNextPendingJob();
        await reconcilePlaylist();
      } finally {
        // Last in the tick, so reading recordings never delays an upload, and it still runs when an upload
        // fails. Off unless AUTO_REVIEW_MODE=dry_run and AUTO_REVIEW_TEACHER=on. Never throws.
        await runTeacherStep();
      }
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
