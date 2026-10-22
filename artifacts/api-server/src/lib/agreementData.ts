import { db, jobsTable, jobDecisionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { computeAgreement, type AgreementEvent, type AgreementJob, type AgreementReport } from "./agreement";
import { extractMeetingCode, getPktInfo } from "./schedule";

/**
 * Builds the agreement report from the database. Reads only: the jobs and the history rows that matter
 * (the rules' verdicts and the reviewer's actions). Nothing is written and no job changes.
 */
export async function loadAgreementReport(now: Date = new Date()): Promise<AgreementReport> {
  const rows = await db
    .select({
      id: jobsTable.id,
      status: jobsTable.status,
      contentType: jobsTable.contentType,
      driveFileName: jobsTable.driveFileName,
      driveCreatedTime: jobsTable.driveCreatedTime,
      proposedTitle: jobsTable.proposedTitle,
      youtubeTitle: jobsTable.youtubeTitle,
    })
    .from(jobsTable);

  const jobs: AgreementJob[] = [];
  for (const r of rows) {
    if (r.contentType !== "video" || !r.driveCreatedTime) continue;
    const code = extractMeetingCode(r.driveFileName);
    if (!code) continue;
    const { dateStr, dayOfWeek } = getPktInfo(r.driveCreatedTime);
    jobs.push({
      id: r.id,
      status: r.status,
      date: dateStr,
      code,
      weekday: dayOfWeek,
      finalTitle: r.status === "done" ? (r.youtubeTitle ?? r.proposedTitle) : r.proposedTitle,
    });
  }

  const history = await db
    .select()
    .from(jobDecisionsTable)
    .where(or(eq(jobDecisionsTable.eventType, "auto_verdict"), eq(jobDecisionsTable.actor, "admin")));
  const events: AgreementEvent[] = history.map((h) => ({
    id: h.id,
    jobId: h.jobId,
    eventType: h.eventType,
    actor: h.actor,
    groupEventId: h.groupEventId,
    createdAt: h.createdAt.getTime(),
    fromTitle: h.fromTitle,
    toTitle: h.toTitle,
    detail: h.detail,
  }));

  return computeAgreement(jobs, events, now);
}
