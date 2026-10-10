import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const driveSourceFoldersTable = pgTable("drive_source_folders", {
  id: serial("id").primaryKey(),
  folderId: text("folder_id").notNull().unique(),
  folderName: text("folder_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DriveSourceFolder = typeof driveSourceFoldersTable.$inferSelect;
