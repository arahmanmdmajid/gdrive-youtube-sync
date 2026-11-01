import { db, jobsTable } from "@workspace/db";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { fetchDurations, type Youtube } from "./youtubeDurations";
import { logger } from "./logger";

/**
 * Stores the YouTube length of every done job that has a video but no stored length (manual uploads
 * and audio lectures, which Drive does not report). Never overwrites a length that is already there.
 */
export async function backfillMissingDurations(youtube: Youtube): Promise<{ requested: number; updated: number; unknown: number }> {
  const rows = await db
    .select({ id: jobsTable.id, videoId: jobsTable.youtubeVideoId })
    .from(jobsTable)
    .where(and(eq(jobsTable.status, "done"), isNull(jobsTable.durationSeconds), isNotNull(jobsTable.youtubeVideoId)));

  const lengths = await fetchDurations(youtube, rows.map((r) => r.videoId!));
  let updated = 0;
  for (const row of rows) {
    const seconds = lengths.get(row.videoId!);
    if (!seconds) continue;
    // IS NULL again: a scan may have stored a length since the select above.
    const done = await db
      .update(jobsTable)
      .set({ durationSeconds: seconds })
      .where(and(eq(jobsTable.id, row.id), isNull(jobsTable.durationSeconds)))
      .returning({ id: jobsTable.id });
    updated += done.length;
  }
  const result = { requested: rows.length, updated, unknown: rows.length - updated };
  logger.info(result, "Backfilled lecture durations from YouTube");
  return result;
}
