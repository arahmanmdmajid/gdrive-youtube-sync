import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const lectureProgressTable = pgTable(
  "lecture_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.jobId)],
);

export const insertLectureProgressSchema = createInsertSchema(lectureProgressTable).omit({ id: true, updatedAt: true });
export type InsertLectureProgress = z.infer<typeof insertLectureProgressSchema>;
export type LectureProgress = typeof lectureProgressTable.$inferSelect;
