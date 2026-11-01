import { db, jobsTable, lectureProgressTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { EXAM_DATE, todayIn } from "./examPlan";
import { buildReadiness, type Readiness } from "./readiness";
import { getStudyPlan } from "./studyPlan";

/** The readiness numbers for one student: every done lecture, what they completed, and their saved plan. */
export async function loadReadiness(userId: number, opts: { today?: string } = {}): Promise<Readiness> {
  const [lectures, completed, plan] = await Promise.all([
    db
      .select({ id: jobsTable.id, durationSeconds: jobsTable.durationSeconds })
      .from(jobsTable)
      .where(eq(jobsTable.status, "done")),
    db
      .select({ jobId: lectureProgressTable.jobId })
      .from(lectureProgressTable)
      .where(and(eq(lectureProgressTable.userId, userId), eq(lectureProgressTable.status, "completed"))),
    getStudyPlan(userId),
  ]);
  return buildReadiness({
    lectures,
    completedIds: new Set(completed.map((r) => r.jobId)),
    plan,
    today: opts.today ?? todayIn(),
    examDate: EXAM_DATE,
  });
}
