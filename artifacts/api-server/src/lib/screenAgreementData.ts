import { db, jobsTable, recordingScreenReadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeScreenAgreement, type ScreenAgreementReport } from "./screenAgreement";

/**
 * Builds the screen agreement report from the database. Reads only: the video jobs and the stored screen reads.
 * Nothing is written and no job changes.
 */
export async function loadScreenAgreementReport(): Promise<ScreenAgreementReport> {
  const [jobs, reads] = await Promise.all([
    db
      .select({
        id: jobsTable.id,
        status: jobsTable.status,
        proposedTitle: jobsTable.proposedTitle,
        youtubeTitle: jobsTable.youtubeTitle,
      })
      .from(jobsTable)
      .where(eq(jobsTable.contentType, "video")),
    db.select().from(recordingScreenReadsTable),
  ]);
  return computeScreenAgreement(
    jobs.map((j) => ({ id: j.id, status: j.status, finalTitle: j.status === "done" ? (j.youtubeTitle ?? j.proposedTitle) : j.proposedTitle })),
    reads.map((r) => ({
      jobId: r.jobId,
      status: r.status,
      subject: r.subject,
      serials: JSON.parse(r.serials ?? "[]") as string[],
      tableVersion: r.tableVersion,
    })),
  );
}
