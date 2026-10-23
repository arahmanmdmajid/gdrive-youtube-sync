import { pgTable, serial, text, integer, timestamp, uniqueIndex, date } from "drizzle-orm/pg-core";

export const scheduleSlotsTable = pgTable("schedule_slots", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun … 6=Sat (JS getUTCDay() convention), PKT
  timeSlot: text("time_slot").notNull(), // "HH:MM", 24h PKT
  serial: text("serial").notNull(),
  subjectAr: text("subject_ar").notNull(),
  teacherAr: text("teacher_ar").notNull(),
  subjectEn: text("subject_en").notNull(),
  teacherEn: text("teacher_en").notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }), // PKT day (YYYY-MM-DD) the slot starts to count; null = always
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("schedule_slots_day_time_idx").on(t.dayOfWeek, t.timeSlot)]);

export type ScheduleSlot = typeof scheduleSlotsTable.$inferSelect;
