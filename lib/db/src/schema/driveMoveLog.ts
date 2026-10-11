import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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

export type DriveMoveLogEntry = typeof driveMoveLogTable.$inferSelect;
