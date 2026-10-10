import { db, settingsTable } from "@workspace/db";
import { logger } from "./logger";
import { maybeRunDailyConsolidation } from "./meetConsolidation";
import { runPipelineScan } from "./scan";
import { processNextPendingJob } from "./upload";
import { reconcilePlaylist } from "./reconcile";
import { reclaimOrphanedJobs } from "./reclaim";
import { QuotaExceededError } from "./youtubeMatch";

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startPipelineWorker() {
  if (workerInterval) return;

  // Sweep before the first tick so a job orphaned by the previous process is
  // resolved rather than sitting invisible until someone notices it by hand.
  void reclaimOrphanedJobs().catch((err) => {
    logger.error({ err }, "reclaimOrphanedJobs failed at startup");
  });

  workerInterval = setInterval(async () => {
    // Independent of autoSync and of the scan below, so a failure here never blocks uploads.
    await maybeRunDailyConsolidation().catch((err) => logger.error({ err }, "Meet consolidation failed"));
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
