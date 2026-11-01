import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** How much a student plans to study, for the exam readiness projection. One row per student. */
export const studyPlansTable = pgTable("study_plans", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Whole minutes, so 1.1 hours is stored exactly instead of as a float.
  minutesPerDay: integer("minutes_per_day").notNull(),
  daysPerWeek: integer("days_per_week").notNull().default(7),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StudyPlan = typeof studyPlansTable.$inferSelect;
