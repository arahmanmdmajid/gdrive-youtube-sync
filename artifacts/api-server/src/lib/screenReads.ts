import { db, jobsTable, recordingScreenReadsTable } from "@workspace/db";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { SCREEN_TABLE_VERSION } from "./screenSubject";
import { readRecordingScreen, type ScreenReadResult, type ScreenReaderDeps } from "./screenReader";
import { RETRY_FAILED_AFTER_MS } from "./teacherReads";
import { sweepTileFolders } from "./teacherReader";
import { extractScreenFrames } from "./tileFrames";
import { windowsOcrLines } from "./windowsOcr";

// Stores and runs the screen reads. What is stored is the verdict of each read (never frames, never text).

export const DEFAULT_SCREEN_RUN_LIMIT = 1;
export const MAX_SCREEN_RUN_LIMIT = 5;

export async function saveScreenRead(jobId: number, r: ScreenReadResult): Promise<void> {
  const values = {
    jobId,
    status: r.status,
    subject: r.subject,
    serials: JSON.stringify(r.serials),
    ambiguous: r.ambiguous,
    framesTotal: r.framesTotal,
    framesRead: r.framesRead,
    framesMatched: r.framesMatched,
    error: r.error,
    tableVersion: SCREEN_TABLE_VERSION,
    readAt: new Date(),
  };
  await db.insert(recordingScreenReadsTable).values(values).onConflictDoUpdate({ target: recordingScreenReadsTable.jobId, set: values });
}

/**
 * Recordings that still need a screen read: in review, video, with a length, and no read made with the
 * current subject table (a failed read counts as unread again after RETRY_FAILED_AFTER_MS). Oldest first.
 */
export async function pickJobsToScan(limit: number, now: Date = new Date()) {
  const jobs = await db
    .select({ id: jobsTable.id, driveFileId: jobsTable.driveFileId, durationSeconds: jobsTable.durationSeconds })
    .from(jobsTable)
    .where(and(eq(jobsTable.status, "needs_review"), eq(jobsTable.contentType, "video"), isNotNull(jobsTable.durationSeconds)))
    .orderBy(asc(jobsTable.driveCreatedTime), asc(jobsTable.id));
  if (jobs.length === 0) return [];

  const reads = await db
    .select()
    .from(recordingScreenReadsTable)
    .where(inArray(recordingScreenReadsTable.jobId, jobs.map((j) => j.id)));
  const byJob = new Map(reads.map((r) => [r.jobId, r]));

  return jobs
    .filter((j) => {
      const r = byJob.get(j.id);
      if (!r || r.tableVersion !== SCREEN_TABLE_VERSION) return true;
      if (r.status === "ok") return false;
      return now.getTime() - r.readAt.getTime() >= RETRY_FAILED_AFTER_MS;
    })
    .slice(0, limit);
}

export interface ScreenRunSummary {
  skipped: string | null;
  attempted: number;
  results: { jobId: number; status: "ok" | "failed"; subject: string | null; serials: string[]; ambiguous: boolean; framesRead: number; framesMatched: number; error: string | null }[];
}

let running = false;

/** Reads up to `limit` recordings now. Only one run at a time. The summary carries no text. */
export async function runScreenReads(
  limit: number = DEFAULT_SCREEN_RUN_LIMIT,
  deps: Partial<ScreenReaderDeps> = {},
): Promise<ScreenRunSummary> {
  if (running) return { skipped: "a run is already in progress", attempted: 0, results: [] };
  running = true;
  try {
    // Frames left by a read that was cut short by a crash or a restart must not stay on disk.
    await sweepTileFolders().catch(() => undefined);
    const picked = await pickJobsToScan(Math.max(1, Math.min(limit, MAX_SCREEN_RUN_LIMIT)));

    const results: ScreenRunSummary["results"] = [];
    for (const job of picked) {
      const r = await readRecordingScreen(job, { extract: extractScreenFrames, ocr: windowsOcrLines, ...deps });
      await saveScreenRead(job.id, r);
      // The log names the job and the outcome. It never carries frames, text or a token.
      logger.info({ jobId: job.id, status: r.status, subject: r.subject, serials: r.serials, ambiguous: r.ambiguous, framesRead: r.framesRead, framesMatched: r.framesMatched, error: r.error }, "Screen read");
      results.push({ jobId: job.id, status: r.status, subject: r.subject, serials: r.serials, ambiguous: r.ambiguous, framesRead: r.framesRead, framesMatched: r.framesMatched, error: r.error });
    }
    return { skipped: null, attempted: picked.length, results };
  } finally {
    running = false;
  }
}

export async function listScreenReads() {
  return db.select().from(recordingScreenReadsTable).orderBy(asc(recordingScreenReadsTable.jobId));
}
