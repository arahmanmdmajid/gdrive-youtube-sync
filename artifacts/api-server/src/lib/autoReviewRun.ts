import { randomUUID } from "node:crypto";
import { db, jobsTable, jobDecisionsTable } from "@workspace/db";
import { desc, eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { readMode, type AutoReviewMode } from "./autoReviewMode";
import { evaluateGroup, RULE_VERSION, type GroupFile, type GroupSlot, type Verdict } from "./autoReview";
import { buildYoutubeTitleFromSlot, extractMeetingCode, getOrderedSlotsForDay, getPktInfo } from "./schedule";

// Dry run of the day-approval rules (issue #27, Stage 1b). It reads jobs, evaluates every day that
// still has a needs_review job, and records what the rules say. It never changes a job.

export interface GroupResult {
  /** "DD-MM-YYYY|meeting-code" */
  key: string;
  date: string;
  meetingCode: string;
  verdict: Verdict;
  fileCount: number;
  needsReviewJobIds: number[];
  /** Changes when the verdict, a failed check, or a job a check is about changes. */
  signature: string;
}

export function signatureOf(verdict: Verdict, fileCount: number): string {
  const reasons = [...verdict.reasons]
    .sort((a, b) => a.check.localeCompare(b.check))
    .map((r) => `${r.check}:${[...r.jobIds].sort((x, y) => x - y).join(",")}`)
    .join(";");
  return `${verdict.ruleVersion}|${verdict.verdict}|${reasons}|n=${fileCount}`;
}

/** Evaluates every (PKT date, meeting code) day that still has at least one needs_review job. Reads only. */
export async function evaluateAllGroups(now: Date = new Date()): Promise<GroupResult[]> {
  const rows = await db
    .select({
      id: jobsTable.id,
      status: jobsTable.status,
      contentType: jobsTable.contentType,
      driveFileName: jobsTable.driveFileName,
      driveCreatedTime: jobsTable.driveCreatedTime,
      driveFileSizeBytes: jobsTable.driveFileSizeBytes,
      durationSeconds: jobsTable.durationSeconds,
      proposedTitle: jobsTable.proposedTitle,
      youtubeTitle: jobsTable.youtubeTitle,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
    })
    .from(jobsTable);

  const titleOf = (r: (typeof rows)[number]) => (r.status === "done" ? (r.youtubeTitle ?? r.proposedTitle) : r.proposedTitle);

  // Every non-rejected title anywhere (manual and audio jobs included), to find collisions.
  const titleCount = new Map<string, number>();
  for (const r of rows) {
    const t = r.status === "rejected" ? null : titleOf(r);
    if (t) titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
  }

  const groups = new Map<string, { date: string; dow: number; code: string; rows: typeof rows }>();
  for (const r of rows) {
    if (r.contentType !== "video" || !r.driveCreatedTime) continue;
    const code = extractMeetingCode(r.driveFileName);
    if (!code) continue;
    const { dateStr, dayOfWeek } = getPktInfo(r.driveCreatedTime);
    const key = `${dateStr}|${code}`;
    const g = groups.get(key) ?? { date: dateStr, dow: dayOfWeek, code, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  const today = getPktInfo(now.toISOString()).dateStr;
  const slotCache = new Map<number, Awaited<ReturnType<typeof getOrderedSlotsForDay>>>();
  const results: GroupResult[] = [];

  for (const [key, g] of groups) {
    const needsReviewJobIds = g.rows.filter((r) => r.status === "needs_review").map((r) => r.id);
    if (needsReviewJobIds.length === 0) continue;

    if (!slotCache.has(g.dow)) slotCache.set(g.dow, await getOrderedSlotsForDay(g.dow));
    const slots: GroupSlot[] = slotCache.get(g.dow)!.map((s) => ({ title: buildYoutubeTitleFromSlot(s, g.date), startTime: s.timeSlot }));

    const files: GroupFile[] = g.rows.map((r) => ({
      id: r.id,
      status: r.status,
      title: titleOf(r) ?? null,
      confirmed: r.lectureNameConfirmed,
      createdTime: r.driveCreatedTime,
      durationSec: r.durationSeconds,
      sizeBytes: r.driveFileSizeBytes,
      contentType: r.contentType,
    }));

    // A title counts as a collision only if a non-rejected job outside this group holds it.
    const own = new Map<string, number>();
    for (const r of g.rows) {
      const t = r.status === "rejected" ? null : titleOf(r);
      if (t) own.set(t, (own.get(t) ?? 0) + 1);
    }
    const otherTitles = [...own.keys()].filter((t) => (titleCount.get(t) ?? 0) > (own.get(t) ?? 0));

    const verdict = evaluateGroup({ date: g.date, meetingCode: g.code, files, slots, today, otherTitles });
    const fileCount = g.rows.filter((r) => r.status !== "rejected").length;
    results.push({ key, date: g.date, meetingCode: g.code, verdict, fileCount, needsReviewJobIds, signature: signatureOf(verdict, fileCount) });
  }
  return results.sort((a, b) => a.key.localeCompare(b.key));
}

export interface RunSummary {
  mode: AutoReviewMode;
  evaluated: number;
  clean: number;
  written: number;
}

/**
 * Runs the dry run if the mode asks for it: evaluates, then records a verdict row for each
 * needs_review job whose group's result has changed since that job's last recorded verdict. Writes
 * only job_decisions rows. Never touches a job.
 */
export async function runAutoReview(mode: AutoReviewMode = readMode()): Promise<RunSummary> {
  if (mode === "off") return { mode, evaluated: 0, clean: 0, written: 0 };

  const results = await evaluateAllGroups();
  const ids = results.flatMap((r) => r.needsReviewJobIds);
  const lastSignature = new Map<number, string>();
  if (ids.length) {
    const latest = await db
      .selectDistinctOn([jobDecisionsTable.jobId], { jobId: jobDecisionsTable.jobId, detail: jobDecisionsTable.detail })
      .from(jobDecisionsTable)
      .where(and(eq(jobDecisionsTable.eventType, "auto_verdict"), inArray(jobDecisionsTable.jobId, ids)))
      .orderBy(jobDecisionsTable.jobId, desc(jobDecisionsTable.id));
    for (const row of latest) {
      try {
        lastSignature.set(row.jobId, (JSON.parse(row.detail ?? "{}") as { signature?: string }).signature ?? "");
      } catch {
        /* an unreadable earlier row counts as no earlier verdict */
      }
    }
  }

  const rowsToWrite: (typeof jobDecisionsTable.$inferInsert)[] = [];
  for (const r of results) {
    const groupEventId = randomUUID();
    const summary = r.verdict.verdict === "clean" ? "clean" : `hold: ${[...new Set(r.verdict.reasons.map((x) => x.check))].join(", ")}`;
    const detail = JSON.stringify({
      ruleVersion: RULE_VERSION,
      verdict: r.verdict.verdict,
      signature: r.signature,
      group: r.key,
      reasons: r.verdict.reasons,
    });
    for (const jobId of r.needsReviewJobIds) {
      if (lastSignature.get(jobId) === r.signature) continue;
      rowsToWrite.push({ groupEventId, jobId, role: "subject", eventType: "auto_verdict", actor: "system", detail, reason: summary });
    }
  }
  if (rowsToWrite.length) await db.insert(jobDecisionsTable).values(rowsToWrite);

  const summary: RunSummary = {
    mode,
    evaluated: results.length,
    clean: results.filter((r) => r.verdict.verdict === "clean").length,
    written: rowsToWrite.length,
  };
  if (summary.written > 0) logger.info(summary, "Auto-review dry run recorded verdicts (no job was changed)");
  return summary;
}
