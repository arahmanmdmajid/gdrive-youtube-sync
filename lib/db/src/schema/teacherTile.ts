import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// How each teacher shows on screen (the name tile of a recording). One row per word. Editable: the real
// aliases are loaded through PUT /api/teacher-aliases and are not kept in the repository.
export const teacherAliasesTable = pgTable(
  "teacher_aliases",
  {
    id: serial("id").primaryKey(),
    // Same spelling as the schedule's teacher name, e.g. "Ustad Haseeb".
    teacher: text("teacher").notNull(),
    // strong: one word identifies the teacher. allOf: every allOf word of the teacher must appear.
    // weak: common names, only counted when two different ones appear.
    kind: text("kind", { enum: ["strong", "allOf", "weak"] }).notNull(),
    word: text("word").notNull(), // lower case
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("teacher_aliases_unique_idx").on(t.teacher, t.kind, t.word)],
);

// The result of reading a recording's name tile. Only the verdict is stored: never the frames and never the
// text that was recognized. One row per job; read again after the alias table changes (aliasHash).
export const recordingTeacherReadsTable = pgTable(
  "recording_teacher_reads",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    // The teacher identified, or null when nobody matched, more than one did, or the read failed.
    teacher: text("teacher"),
    ambiguous: boolean("ambiguous").notNull().default(false),
    // JSON array of the teachers that matched.
    matched: text("matched"),
    framesTotal: integer("frames_total").notNull().default(0),
    framesRead: integer("frames_read").notNull().default(0),
    framesMatched: integer("frames_matched").notNull().default(0),
    // Why a read failed, short and never recognized text.
    error: text("error"),
    // Hash of the alias table used, so a changed table means the read is out of date.
    aliasHash: text("alias_hash").notNull(),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("recording_teacher_reads_job_idx").on(t.jobId), index("recording_teacher_reads_hash_idx").on(t.aliasHash)],
);

export type TeacherAliasRow = typeof teacherAliasesTable.$inferSelect;
export type RecordingTeacherRead = typeof recordingTeacherReadsTable.$inferSelect;
