import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { getYoutubeClient } from "./youtubeClient";
import { logger } from "./logger";

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
