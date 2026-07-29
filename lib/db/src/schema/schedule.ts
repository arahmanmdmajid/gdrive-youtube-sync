import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scheduleSlotsTable = pgTable("schedule_slots", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun … 6=Sat (JS getUTCDay() convention), PKT
  timeSlot: text("time_slot").notNull(), // "HH:MM", 24h PKT
  serial: text("serial").notNull(),
  subjectAr: text("subject_ar").notNull(),
  teacherAr: text("teacher_ar").notNull(),
  subjectEn: text("subject_en").notNull(),
  teacherEn: text("teacher_en").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("schedule_slots_day_time_idx").on(t.dayOfWeek, t.timeSlot)]);

export const insertScheduleSlotSchema = createInsertSchema(scheduleSlotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScheduleSlot = z.infer<typeof insertScheduleSlotSchema>;
export type ScheduleSlot = typeof scheduleSlotsTable.$inferSelect;
