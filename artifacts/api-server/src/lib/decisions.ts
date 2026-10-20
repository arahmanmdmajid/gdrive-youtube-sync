import { randomUUID } from "node:crypto";
import { db, jobsTable, jobDecisionsTable } from "@workspace/db";
import { diffSnapshots, type JobSnap } from "./decisionDiff";
import { logger } from "./logger";

export type DecisionEventType = "proposal" | "reproposal" | "approve" | "edit" | "reject" | "restore";

/** Current title, status and confirmed flag of every job. Small table, so one cheap read. */
export async function snapshotJobs(): Promise<Map<number, JobSnap>> {
  const rows = await db
    .select({
      id: jobsTable.id,
      proposedTitle: jobsTable.proposedTitle,
      status: jobsTable.status,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
    })
    .from(jobsTable);
  return new Map(rows.map((r) => [r.id, r]));
}

interface RecordOptions {
  eventType: DecisionEventType;
  actor: "admin" | "system";
  /** The job the action was on. Null for a scan, where every changed job is its own subject. */
  subjectId: number | null;
  /** "swap" or "merge" when the caller chose one; other changed jobs are otherwise "cascade". */
  conflictResolution?: "swap" | "merge";
  /** Only log needs_review jobs (a scan must not log upload status changes). */
  onlyNeedsReview?: boolean;
}

/**
 * Writes one row per job that changed between `before` and now. Best effort: the audit trail
 * must never break a review action, so a failure is logged and swallowed.
 */
export async function recordDecisions(before: Map<number, JobSnap>, opts: RecordOptions): Promise<void> {
  try {
    const after = await snapshotJobs();
    const rows = diffSnapshots(
      before,
      after,
      opts.subjectId,
      opts.conflictResolution ?? "cascade",
      opts.onlyNeedsReview ?? false,
    );
    if (rows.length === 0) return;
    const groupEventId = randomUUID();
    await db.insert(jobDecisionsTable).values(
      rows.map((r) => ({
        ...r,
        // A scan has no single subject, so each changed job is the subject of its own proposal:
        // "proposal" for a new job, "reproposal" for a title the scan changed.
        role: opts.subjectId === null ? ("subject" as const) : r.role,
        detail: opts.subjectId === null ? null : r.detail,
        groupEventId,
        eventType: opts.subjectId === null && r.fromStatus !== null ? "reproposal" : opts.eventType,
        actor: opts.actor,
      })),
    );
  } catch (err) {
    logger.warn({ err, eventType: opts.eventType, subjectId: opts.subjectId }, "Could not write decision history");
  }
}

/**
 * Snapshot, run the action, then record what it changed. If the action throws, the changes it
 * made before throwing are still recorded, then the error is rethrown.
 */
export async function withDecisionLog<T>(opts: RecordOptions, action: () => Promise<T>): Promise<T> {
  let before: Map<number, JobSnap> | null = null;
  try {
    before = await snapshotJobs();
  } catch (err) {
    logger.warn({ err, eventType: opts.eventType }, "Could not snapshot jobs for decision history");
  }
  try {
    return await action();
  } finally {
    if (before) await recordDecisions(before, opts);
  }
}
