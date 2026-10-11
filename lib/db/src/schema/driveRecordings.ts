import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// One row per merged day folder ("<code> - YYYY/MM/DD") in the consolidation target. Filled by
// the Meet merge job and read by the public recordings page.
export const driveRecordingsTable = pgTable("drive_recordings", {
  id: serial("id").primaryKey(),
  folderId: text("folder_id").notNull().unique(),
  folderName: text("folder_name").notNull(),
  meetingCode: text("meeting_code").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD (PKT)
  fileCount: integer("file_count").notNull().default(0),
  webViewLink: text("web_view_link").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Every move, rename and trash made by the Meet merge, so a run can be reversed even when it
// ran somewhere without a persistent disk (replaces meet-moves.jsonl there).
export const driveMoveLogTable = pgTable(
  "drive_move_log",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["move", "rename", "trash"] }).notNull(),
    fileId: text("file_id").notNull(),
    fromId: text("from_id"),
    toId: text("to_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("drive_move_log_file_id_idx").on(t.fileId)],
);

export type DriveRecording = typeof driveRecordingsTable.$inferSelect;
export type DriveMoveLogEntry = typeof driveMoveLogTable.$inferSelect;
