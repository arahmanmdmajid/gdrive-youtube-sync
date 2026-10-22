import { db, jobsTable, teacherAliasesTable, recordingTeacherReadsTable } from "@workspace/db";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import type { AliasEntry } from "./teacherTile";
import { aliasHash, entriesFromRows, rowsFromEntries, type AliasRow } from "./teacherAliasTable";
import { readRecordingTeacher, sweepTileFolders, type ReadResult, type ReaderDeps } from "./teacherReader";
import { extractTileFrames } from "./tileFrames";
import { windowsOcr } from "./windowsOcr";

// Stores and runs the teacher reads. What is stored is the verdict of each read (never frames, never text).

/** A failed read is tried again after this long, so an outage does not make every run retry the same job. */
export const RETRY_FAILED_AFTER_MS = 30 * 60 * 1000;
export const DEFAULT_RUN_LIMIT = 2;
export const MAX_RUN_LIMIT = 10;

export async function loadAliases(): Promise<AliasEntry[]> {
  const rows = await db.select().from(teacherAliasesTable);
  return entriesFromRows(rows.map((r): AliasRow => ({ teacher: r.teacher, kind: r.kind, word: r.word })));
}

/** Replaces the whole alias table. */
export async function replaceAliases(entries: AliasEntry[]): Promise<number> {
  const rows = rowsFromEntries(entries);
  await db.transaction(async (tx) => {
    await tx.delete(teacherAliasesTable);
    if (rows.length) await tx.insert(teacherAliasesTable).values(rows);
  });
  return rows.length;
}

export async function saveRead(jobId: number, result: ReadResult, hash: string): Promise<void> {
  const values = {
    jobId,
    status: result.status,
    teacher: result.teacher,
    ambiguous: result.ambiguous,
    matched: JSON.stringify(result.matched),
    framesTotal: result.framesTotal,
    framesRead: result.framesRead,
    framesMatched: result.framesMatched,
    error: result.error,
    aliasHash: hash,
    readAt: new Date(),
  };
  await db
    .insert(recordingTeacherReadsTable)
    .values(values)
    .onConflictDoUpdate({ target: recordingTeacherReadsTable.jobId, set: values });
}

export interface PickedJob {
  id: number;
  driveFileId: string;
  durationSeconds: number | null;
}

/**
 * Recordings that still need reading: in review, video, with a length, and no read made with the current
 * alias table (a failed read counts as unread again after RETRY_FAILED_AFTER_MS). Oldest first.
 */
export async function pickJobsToRead(hash: string, limit: number, now: Date = new Date()): Promise<PickedJob[]> {
  const jobs = await db
    .select({
      id: jobsTable.id,
      driveFileId: jobsTable.driveFileId,
      durationSeconds: jobsTable.durationSeconds,
    })
    .from(jobsTable)
    .where(and(eq(jobsTable.status, "needs_review"), eq(jobsTable.contentType, "video"), isNotNull(jobsTable.durationSeconds)))
    .orderBy(asc(jobsTable.driveCreatedTime), asc(jobsTable.id));
  if (jobs.length === 0) return [];

  const reads = await db
    .select()
    .from(recordingTeacherReadsTable)
    .where(inArray(recordingTeacherReadsTable.jobId, jobs.map((j) => j.id)));
  const byJob = new Map(reads.map((r) => [r.jobId, r]));

  const due = jobs.filter((j) => {
    const r = byJob.get(j.id);
    if (!r || r.aliasHash !== hash) return true;
    if (r.status === "ok") return false;
    return now.getTime() - r.readAt.getTime() >= RETRY_FAILED_AFTER_MS;
  });
  return due.slice(0, limit);
}

export interface RunSummary {
  skipped: string | null;
  attempted: number;
  results: { jobId: number; status: "ok" | "failed"; teacher: string | null; ambiguous: boolean; framesRead: number; framesMatched: number; error: string | null }[];
}

let running = false;

/** Reads up to `limit` recordings now. Only one run at a time. The summary carries no text. */
export async function runReads(
  limit: number = DEFAULT_RUN_LIMIT,
  deps: Partial<Pick<ReaderDeps, "extract" | "ocr" | "makeTempDir" | "removeDir">> = {},
): Promise<RunSummary> {
  if (running) return { skipped: "a run is already in progress", attempted: 0, results: [] };
  running = true;
  try {
    // Frames left by a read that was cut short by a crash or a restart must not stay on disk.
    await sweepTileFolders().catch(() => undefined);
    const aliases = await loadAliases();
    if (aliases.length === 0) return { skipped: "the alias table is empty", attempted: 0, results: [] };
    const hash = aliasHash(aliases);
    const picked = await pickJobsToRead(hash, Math.max(1, Math.min(limit, MAX_RUN_LIMIT)));

    const results: RunSummary["results"] = [];
    for (const job of picked) {
      const result = await readRecordingTeacher(job, { extract: extractTileFrames, ocr: windowsOcr, ...deps, aliases });
      await saveRead(job.id, result, hash);
      // The log names the job and the outcome. It never carries frames, text or a token.
      logger.info(
        { jobId: job.id, status: result.status, teacher: result.teacher, ambiguous: result.ambiguous, framesRead: result.framesRead, framesMatched: result.framesMatched, error: result.error },
        "Teacher read",
      );
      results.push({
        jobId: job.id,
        status: result.status,
        teacher: result.teacher,
        ambiguous: result.ambiguous,
        framesRead: result.framesRead,
        framesMatched: result.framesMatched,
        error: result.error,
      });
    }
    return { skipped: null, attempted: picked.length, results };
  } finally {
    running = false;
  }
}

export async function listReads() {
  return db.select().from(recordingTeacherReadsTable).orderBy(asc(recordingTeacherReadsTable.jobId));
}

/**
 * The teacher each recording was read with, for the reads that can be used: made with the CURRENT alias
 * table and finished ok. A read that found nobody maps to null ("read, not identified"). A failed read, an
 * out-of-date read and no read are simply absent: no evidence.
 */
export async function loadTeacherEvidence(jobIds: number[]): Promise<Map<number, string | null>> {
  const evidence = new Map<number, string | null>();
  if (jobIds.length === 0) return evidence;
  const aliases = await loadAliases();
  if (aliases.length === 0) return evidence;
  const hash = aliasHash(aliases);
  const reads = await db
    .select({ jobId: recordingTeacherReadsTable.jobId, teacher: recordingTeacherReadsTable.teacher })
    .from(recordingTeacherReadsTable)
    .where(and(inArray(recordingTeacherReadsTable.jobId, jobIds), eq(recordingTeacherReadsTable.aliasHash, hash), eq(recordingTeacherReadsTable.status, "ok")));
  for (const r of reads) evidence.set(r.jobId, r.teacher);
  return evidence;
}
