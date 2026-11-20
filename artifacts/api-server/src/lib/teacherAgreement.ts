// Compares the teacher the name-tile read found with the teacher in the title a recording ended up with
// (issue #105, step 2). Pure: it takes plain data and returns a report. It reads nothing, writes nothing and
// never changes a job.
//
// Caveat: with TITLE_BY_TEACHER=on the proposed title is itself built from the read, so agreement is then partly
// circular. Compare numbers from before that switch, or read them knowing this.

/** Statuses a job has after it left review. A job in review has no final title yet, and a rejected one has none. */
const LEFT_REVIEW = new Set(["pending", "processing", "done", "failed", "removed"]);

export interface TeacherAgreementJob {
  id: number;
  status: string;
  /** The title the job has now: the YouTube title for a finished job, the proposed title otherwise. */
  finalTitle: string | null;
}

export interface TeacherAgreementRead {
  jobId: number;
  status: "ok" | "failed";
  teacher: string | null;
  aliasHash: string;
}

export interface TeacherDisagreement {
  jobId: number;
  /** The teacher the read found. */
  teacher: string;
  /** The job's title: either the read or the title is wrong, only a person can tell. */
  title: string;
}

export interface TeacherAgreementReport {
  /** Jobs that left review, the ones that can be compared. */
  jobsLeftReview: number;
  /** Left review with no read at all (reads are only made in review). */
  notRead: number;
  /** A read exists but names nobody: it failed, found no one or two, or was made with an older alias table. */
  noVerdict: number;
  agree: number;
  disagree: number;
  byTeacher: { teacher: string; agree: number; disagree: number }[];
  disagreements: TeacherDisagreement[];
}

/** Titles are `{serial} {subject} | {teacher} | {date}` (a revision or a part adds more after the date). */
export function teacherOfTitle(title: string | null | undefined): string | null {
  const parts = (title ?? "").split("|");
  return parts.length >= 2 ? parts[1].trim() || null : null;
}

const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** `currentHash` is the hash of the alias table now, or null when it is empty (then every read is out of date). */
export function computeTeacherAgreement(
  jobs: TeacherAgreementJob[],
  reads: TeacherAgreementRead[],
  currentHash: string | null,
): TeacherAgreementReport {
  const readByJob = new Map(reads.map((r) => [r.jobId, r]));
  const teachers = new Map<string, { agree: number; disagree: number }>();
  const disagreements: TeacherDisagreement[] = [];
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
    if (read.status !== "ok" || !read.teacher || currentHash === null || read.aliasHash !== currentHash) {
      noVerdict++;
      continue;
    }
    const counts = teachers.get(read.teacher) ?? { agree: 0, disagree: 0 };
    teachers.set(read.teacher, counts);
    const inTitle = teacherOfTitle(job.finalTitle);
    if (inTitle !== null && norm(inTitle) === norm(read.teacher)) {
      agree++;
      counts.agree++;
    } else {
      disagree++;
      counts.disagree++;
      disagreements.push({ jobId: job.id, teacher: read.teacher, title: job.finalTitle ?? "" });
    }
  }

  return {
    jobsLeftReview,
    notRead,
    noVerdict,
    agree,
    disagree,
    byTeacher: [...teachers].map(([teacher, c]) => ({ teacher, ...c })).sort((a, b) => a.teacher.localeCompare(b.teacher)),
    disagreements: disagreements.sort((a, b) => a.jobId - b.jobId),
  };
}
