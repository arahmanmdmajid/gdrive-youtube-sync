import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getYoutubeClient } from "./youtubeClient";
import { buildYoutubeTitle } from "./schedule";
import { logger } from "./logger";
import { findVideoOnYoutube, INCOMPLETE_UPLOAD_GRACE_MS, type YoutubeMatch } from "./youtubeMatch";


/**
 * Reclaims jobs left stranded in "processing" by a process death.
 *
 * uploadJob() defends against *errors* (quota, transient, auth) but not against
 * the process itself dying mid-upload — a PM2 restart, a crash, or the machine
 * sleeping. When that happens the row keeps status "processing" with no error
 * message, and nothing ever picks it up again: both processNextPendingJob and
 * processAllPendingJobs only select status "pending".
 *
 * Only one worker process runs at a time, so at startup nothing can legitimately
 * still be uploading — every "processing" row is orphaned by definition. That
 * makes startup the safe place to sweep, as opposed to an age-based timer, which
 * would race genuinely slow uploads of large recordings.
 *
 * The video is often already on YouTube: the usual death window is between
 * videos.insert returning and the "done" write landing. So check the channel by
 * title first and adopt the existing upload rather than re-uploading it, which
 * is what previously forced a manual delete-and-rescan.
 */
export async function reclaimOrphanedJobs(
  opts: { excludeIds?: number[]; minAgeMs?: number } = {},
): Promise<{ recovered: number; requeued: number }> {
  // At worker start nothing is uploading, so every processing job is orphaned. Run later (the tick),
  // skip the jobs this process is uploading or still has to record, and only take jobs that have
  // sat in processing for a while.
  const exclude = new Set(opts.excludeIds ?? []);
  const cutoff = opts.minAgeMs ? Date.now() - opts.minAgeMs : null;
  const orphaned = (await db.select().from(jobsTable).where(eq(jobsTable.status, "processing"))).filter(
    (j) => !exclude.has(j.id) && (cutoff === null || j.updatedAt.getTime() <= cutoff),
  );
  if (orphaned.length === 0) return { recovered: 0, requeued: 0 };

  logger.warn({ count: orphaned.length }, "Found jobs stranded in processing — reclaiming");
  const [settings] = await db.select().from(settingsTable).limit(1);
  const youtube = getYoutubeClient();
  let recovered = 0;
  let requeued = 0;

  for (const job of orphaned) {
    const title = job.proposedTitle ?? (await buildYoutubeTitle(job.driveFileName, job.driveCreatedTime));
    let match: YoutubeMatch | null = null;
    try {
      match = await findVideoOnYoutube(youtube, title);
    } catch (err) {
      logger.warn({ jobId: job.id, err }, "Reclaim: YouTube lookup failed — leaving job as-is for the next sweep");
      continue;
    }

    // A match that hasn't completed is either still transcoding (fine, give it
    // time) or a husk left by the interrupted upload (must re-upload). Age is
    // what separates them: transcoding finishes, a husk never does. Waiting is
    // the safe side of the trade — re-uploading a good video creates a
    // duplicate, whereas waiting only costs another restart.
    if (match && !match.complete) {
      const ageMs = match.publishedAt ? Date.now() - Date.parse(match.publishedAt) : Infinity;
      if (ageMs < INCOMPLETE_UPLOAD_GRACE_MS) {
        logger.info(
          { jobId: job.id, videoId: match.videoId, ageMs },
          "Reclaim: match still transcoding — leaving job processing, will re-check on the next sweep",
        );
        continue;
      }
      logger.warn(
        { jobId: job.id, videoId: match.videoId },
        "Reclaim: match is an incomplete upload — requeueing for a fresh upload (the husk stays on YouTube for manual deletion)",
      );
    }

    if (!match || !match.complete) {
      await db.update(jobsTable)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(jobsTable.id, job.id));
      requeued++;
      logger.info({ jobId: job.id, title }, "Reclaim: requeued as pending");
      continue;
    }

    const existingId = match.videoId;
    await db.update(jobsTable)
      .set({
        status: "done",
        youtubeVideoId: existingId,
        youtubeUrl: `https://www.youtube.com/watch?v=${existingId}`,
        youtubeTitle: title,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, job.id));
    recovered++;
    logger.info({ jobId: job.id, existingId, title }, "Reclaim: upload already on YouTube — marked done");

    // The playlist insert runs after the "done" write in uploadJob, so a job that
    // died in that window is on the channel but not in the playlist. Best-effort,
    // exactly as in the normal path.
    if (settings?.youtubePlaylistId) {
      try {
        await youtube?.playlistItems.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: settings.youtubePlaylistId,
              resourceId: { kind: "youtube#video", videoId: existingId },
            },
          },
        });
      } catch (playlistErr) {
        logger.warn({ jobId: job.id, existingId, playlistErr }, "Reclaim: playlist insert failed");
      }
    }
  }

  logger.info({ recovered, requeued }, "Reclaim complete");
  return { recovered, requeued };
}
