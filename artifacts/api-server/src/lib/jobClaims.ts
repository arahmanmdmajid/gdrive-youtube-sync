import { db, jobsTable } from "@workspace/db";
import { and, eq, inArray, ne, or } from "drizzle-orm";

// Every status change that decides whether a job gets uploaded is one conditional UPDATE, so two
// callers (the worker, a batch, an undo, an approve) can never both win: the database lets exactly
// one of them change the row, and the others get nothing back.

type Job = typeof jobsTable.$inferSelect;

/** Takes a pending job for upload. Returns the job as it is now, or null if it is no longer pending. */
export async function claimPendingJob(id: number): Promise<Job | null> {
  const [row] = await db
    .update(jobsTable)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "pending")))
    .returning();
  return row ?? null;
}

/** Records that the job's video is on YouTube. Throws if the database write fails. */
export async function markJobDone(jobId: number, videoId: string, title: string): Promise<void> {
  await db
    .update(jobsTable)
    .set({
      status: "done",
      youtubeVideoId: videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      youtubeTitle: title,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, jobId));
}

/** Takes a pending job back to review. Returns null if it was already claimed or is not pending. */
export async function undoPendingJob(id: number): Promise<Job | null> {
  const [row] = await db
    .update(jobsTable)
    .set({ status: "needs_review", updatedAt: new Date() })
    .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "pending")))
    .returning();
  return row ?? null;
}

/** Approves a job only if it is still in needs_review. Returns null if it moved in the meantime. */
export async function approveIfNeedsReview(id: number, updates: Record<string, unknown>): Promise<Job | null> {
  const [row] = await db
    .update(jobsTable)
    .set({ ...updates, status: "pending" } as Partial<typeof jobsTable.$inferInsert>)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "needs_review")))
    .returning();
  return row ?? null;
}

/**
 * Checked after the claim and before any bytes are sent to YouTube. Returns the reason the job must
 * not be uploaded, or null if it is fine: an empty title, or another job that already holds this
 * exact title as an upload in progress or done (uploading it again would create a duplicate).
 */
export async function uploadBlockReason(id: number, title: string): Promise<string | null> {
  if (!title.trim()) return "The title is empty.";
  const [other] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        ne(jobsTable.id, id),
        inArray(jobsTable.status, ["processing", "done"]),
        or(eq(jobsTable.proposedTitle, title), eq(jobsTable.youtubeTitle, title)),
      ),
    )
    .limit(1);
  return other ? `Job #${other.id} already has an upload with this title. Change the title or reject this job.` : null;
}
