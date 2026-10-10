// Facade: the pipeline lives in scan / titles / upload / youtubeMatch / reconcile / reclaim / worker.
// Callers import from here so the split stays invisible to them.
export { isQuotaError, isThumbnailRateLimited, type YoutubeMatch } from "./youtubeMatch";
export { collectVideoFiles, discoverDriveSourceFolders, runPipelineScan } from "./scan";
export { reflowGroupTitles } from "./titles";
export { processNextPendingJob, processJobById, processAllPendingJobs } from "./upload";
export { reconcilePlaylist } from "./reconcile";
export { reclaimOrphanedJobs } from "./reclaim";
export { startPipelineWorker } from "./worker";
