import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// The result of reading which book is open on the shared screen in a recording (the file name in the PDF
// viewer's toolbar). Only the verdict is stored: never the frames and never the text that was recognized.
// One row per job; read again after the subject table changes (tableVersion).
export const recordingScreenReadsTable = pgTable(
  "recording_screen_reads",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    // The subject named, or null when no book was seen, two disagreed, or the read failed.
    subject: text("subject"),
    // JSON array of the lecture serials that subject allows, e.g. ["1.2"].
    serials: text("serials"),
    ambiguous: boolean("ambiguous").notNull().default(false),
    framesTotal: integer("frames_total").notNull().default(0),
    framesRead: integer("frames_read").notNull().default(0),
    framesMatched: integer("frames_matched").notNull().default(0),
    // Why a read failed, short and never recognized text.
    error: text("error"),
    // SCREEN_TABLE_VERSION at the time, so a changed subject table means the read is out of date.
    tableVersion: integer("table_version").notNull(),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("recording_screen_reads_job_idx").on(t.jobId)],
);

export type RecordingScreenRead = typeof recordingScreenReadsTable.$inferSelect;
