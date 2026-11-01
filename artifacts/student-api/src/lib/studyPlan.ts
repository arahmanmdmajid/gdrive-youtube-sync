import { db, studyPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface StudyPlanInput {
  hoursPerDay: number;
  daysPerWeek: number;
}

export async function getStudyPlan(userId: number): Promise<StudyPlanInput | null> {
  const [row] = await db.select().from(studyPlansTable).where(eq(studyPlansTable.userId, userId)).limit(1);
  return row ? { hoursPerDay: Math.round((row.minutesPerDay / 60) * 100) / 100, daysPerWeek: row.daysPerWeek } : null;
}

export async function saveStudyPlan(userId: number, plan: StudyPlanInput): Promise<void> {
  const minutesPerDay = Math.max(1, Math.round(plan.hoursPerDay * 60));
  await db
    .insert(studyPlansTable)
    .values({ userId, minutesPerDay, daysPerWeek: plan.daysPerWeek })
    .onConflictDoUpdate({
      target: studyPlansTable.userId,
      set: { minutesPerDay, daysPerWeek: plan.daysPerWeek, updatedAt: new Date() },
    });
}
