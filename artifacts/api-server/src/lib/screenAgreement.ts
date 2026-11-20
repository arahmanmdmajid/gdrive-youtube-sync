import { SCREEN_TABLE_VERSION, screenAgreesWith } from "./screenSubject";

// Compares what the screen check saw with the title a recording ended up with (issue #105). Pure: it takes plain
// data and returns a report. It reads nothing, writes nothing and never changes a job.

/** Statuses a job has after it left review. A job in review has no final title yet, and a rejected one has none. */
const LEFT_REVIEW = new Set(["pending", "processing", "done", "failed", "removed"]);

export interface ScreenAgreementJob {
  id: number;
  status: string;
  /** The title the job has now: the YouTube title for a finished job, the proposed title otherwise. */
  finalTitle: string | null;
}

export interface ScreenAgreementRead {
  jobId: number;
  status: "ok" | "failed";
  subject: string | null;
  serials: string[];
  tableVersion: number;
}

export interface ScreenDisagreement {
  jobId: number;
  /** What the screen showed. */
  subject: string;
  serials: string[];
  /** The job's title: either the read or the title is wrong, only a person can tell. */
  title: string;
}

export interface ScreenAgreementReport {
  tableVersion: number;
  /** Jobs that left review, the ones that can be compared. */
  jobsLeftReview: number;
  /** Left review with no read at all (reads are only made in review). */
  notRead: number;
  /** A read exists but gave no subject: it failed, saw no book or two, or was made with an older subject table. */
  noVerdict: number;
  agree: number;
  disagree: number;
  bySubject: { subject: string; agree: number; disagree: number }[];
  disagreements: ScreenDisagreement[];
}

export function computeScreenAgreement(
  jobs: ScreenAgreementJob[],
  reads: ScreenAgreementRead[],
  currentVersion: number = SCREEN_TABLE_VERSION,
): ScreenAgreementReport {
  const readByJob = new Map(reads.map((r) => [r.jobId, r]));
  const subjects = new Map<string, { agree: number; disagree: number }>();
  const disagreements: ScreenDisagreement[] = [];
  let jobsLeftReview = 0;
  let notRead = 0;
  let noVerdict = 0;
  let agree = 0;
  let disagree = 0;

  for (const job of jobs) {
    if (!LEFT_REVIEW.has(job.status)) continue;
    jobsLeftReview++;
    const read = readByJob.get(job.id);
    if (!read) {
      notRead++;
      continue;
    }
    if (read.status !== "ok" || !read.subject || read.tableVersion !== currentVersion) {
      noVerdict++;
      continue;
    }
    const counts = subjects.get(read.subject) ?? { agree: 0, disagree: 0 };
    subjects.set(read.subject, counts);
    if (screenAgreesWith(job.finalTitle, { subject: read.subject, serials: read.serials })) {
      agree++;
      counts.agree++;
    } else {
      disagree++;
      counts.disagree++;
      disagreements.push({ jobId: job.id, subject: read.subject, serials: read.serials, title: job.finalTitle ?? "" });
    }
  }

  return {
    tableVersion: currentVersion,
    jobsLeftReview,
    notRead,
    noVerdict,
    agree,
    disagree,
    bySubject: [...subjects].map(([subject, c]) => ({ subject, ...c })).sort((a, b) => a.subject.localeCompare(b.subject)),
    disagreements: disagreements.sort((a, b) => a.jobId - b.jobId),
  };
}
