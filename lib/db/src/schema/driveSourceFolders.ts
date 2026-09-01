import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driveSourceFoldersTable = pgTable("drive_source_folders", {
  id: serial("id").primaryKey(),
  folderId: text("folder_id").notNull().unique(),
  folderName: text("folder_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDriveSourceFolderSchema = createInsertSchema(driveSourceFoldersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDriveSourceFolder = z.infer<typeof insertDriveSourceFolderSchema>;
export type DriveSourceFolder = typeof driveSourceFoldersTable.$inferSelect;
