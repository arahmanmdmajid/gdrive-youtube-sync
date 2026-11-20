import { db, jobsTable, recordingTeacherReadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadAliases } from "./teacherReads";
import { aliasHash } from "./teacherAliasTable";
import { computeTeacherAgreement, type TeacherAgreementReport } from "./teacherAgreement";

/**
 * Builds the teacher agreement report from the database. Reads only: the video jobs, the stored teacher reads
 * and the alias table (for its hash). Nothing is written and no job changes.
 */
export async function loadTeacherAgreementReport(): Promise<TeacherAgreementReport> {
  const [jobs, reads, aliases] = await Promise.all([
    db
      .select({
        id: jobsTable.id,
        status: jobsTable.status,
        proposedTitle: jobsTable.proposedTitle,
        youtubeTitle: jobsTable.youtubeTitle,
      })
      .from(jobsTable)
      .where(eq(jobsTable.contentType, "video")),
    db.select().from(recordingTeacherReadsTable),
    loadAliases(),
  ]);
  return computeTeacherAgreement(
    jobs.map((j) => ({ id: j.id, status: j.status, finalTitle: j.status === "done" ? (j.youtubeTitle ?? j.proposedTitle) : j.proposedTitle })),
    reads.map((r) => ({ jobId: r.jobId, status: r.status, teacher: r.teacher, aliasHash: r.aliasHash })),
    aliases.length === 0 ? null : aliasHash(aliases),
  );
}
