// Pure helper for the decision history: compares two snapshots of the jobs table and returns one
// row per job whose title, status or confirmed flag changed. No imports, so it can be unit tested
// on its own (see decisionDiff.test.ts).

export interface JobSnap {
  id: number;
  proposedTitle: string | null;
  status: string;
  lectureNameConfirmed: boolean;
}

export interface DecisionDiffRow {
  jobId: number;
  role: "subject" | "affected";
  detail: string | null;
  fromTitle: string | null;
  toTitle: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  fromConfirmed: boolean | null;
  toConfirmed: boolean | null;
}

/**
 * `subjectId` is the job the action was on (null for a scan, which has no single subject).
 * `detail` ("swap", "merge" or "cascade") is attached to rows of jobs other than the subject.
 * A job only in `after` is new (from* fields null). A job only in `before` was deleted and is skipped.
 * Only needs_review jobs are reported when `onlyNeedsReview` is set (a scan must not log the
 * upload worker's status changes).
 */
export function diffSnapshots(
  before: Map<number, JobSnap>,
  after: Map<number, JobSnap>,
  subjectId: number | null,
  detail: string | null,
  onlyNeedsReview = false,
): DecisionDiffRow[] {
  const rows: DecisionDiffRow[] = [];
  for (const [id, b] of after) {
    const a = before.get(id);
    if (!a) {
      rows.push({
        jobId: id,
        role: id === subjectId ? "subject" : "affected",
        detail: id === subjectId ? null : detail,
        fromTitle: null,
        toTitle: b.proposedTitle,
        fromStatus: null,
        toStatus: b.status,
        fromConfirmed: null,
        toConfirmed: b.lectureNameConfirmed,
      });
      continue;
    }
    if (onlyNeedsReview && (a.status !== "needs_review" || b.status !== "needs_review")) continue;
    if (
      a.proposedTitle === b.proposedTitle &&
      a.status === b.status &&
      a.lectureNameConfirmed === b.lectureNameConfirmed
    ) {
      continue;
    }
    rows.push({
      jobId: id,
      role: id === subjectId ? "subject" : "affected",
      detail: id === subjectId ? null : detail,
      fromTitle: a.proposedTitle,
      toTitle: b.proposedTitle,
      fromStatus: a.status,
      toStatus: b.status,
      fromConfirmed: a.lectureNameConfirmed,
      toConfirmed: b.lectureNameConfirmed,
    });
  }
  return rows;
}
