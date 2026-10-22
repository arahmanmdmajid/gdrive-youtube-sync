import { logger } from "./logger";
import { readMode, readTeacherMode, teacherReadsPerTick, type AutoReviewMode, type TeacherMode } from "./autoReviewMode";
import type { RunSummary as ReadSummary } from "./teacherReads";

export interface TeacherStepOptions {
  reviewMode?: AutoReviewMode;
  teacherMode?: TeacherMode;
  limit?: number;
  /** For tests: the reader and the dry run. The defaults are loaded only when needed, so a test needs no database. */
  reads?: (limit: number) => Promise<ReadSummary>;
  review?: (mode: AutoReviewMode) => Promise<unknown>;
}

export interface TeacherStepResult {
  ran: boolean;
  attempted: number;
}

/**
 * The end of a worker tick: read a few recordings' name tiles, and if anything was read, run the dry run
 * again so the new evidence is recorded straight away. Does nothing unless AUTO_REVIEW_MODE=dry_run and
 * AUTO_REVIEW_TEACHER=on. It runs last in the tick, so it never delays an upload. It never throws: a
 * failure is logged and the tick carries on.
 */
export async function runTeacherStep(opts: TeacherStepOptions = {}): Promise<TeacherStepResult> {
  const reviewMode = opts.reviewMode ?? readMode();
  const teacherMode = opts.teacherMode ?? readTeacherMode();
  if (reviewMode !== "dry_run" || teacherMode !== "on") return { ran: false, attempted: 0 };

  try {
    const reads = opts.reads ?? (async (n: number) => (await import("./teacherReads")).runReads(n));
    const review = opts.review ?? (async (mode: AutoReviewMode) => (await import("./autoReviewRun")).runAutoReview(mode));
    const summary = await reads(opts.limit ?? teacherReadsPerTick());
    if (summary.attempted > 0) await review(reviewMode);
    return { ran: true, attempted: summary.attempted };
  } catch (err) {
    // Never stops the tick. The error is ours (database, reader), never frames or recognized text.
    logger.error({ err }, "Teacher reads failed");
    return { ran: true, attempted: 0 };
  }
}
