import { pgTable, serial, text, integer, bigint, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  driveFileId: text("drive_file_id").notNull().unique(),
  driveFileName: text("drive_file_name").notNull(),
  driveFileSizeBytes: bigint("drive_file_size_bytes", { mode: "number" }),
  driveCreatedTime: text("drive_created_time"),
  status: text("status", { enum: ["needs_review", "pending", "processing", "done", "failed", "rejected", "removed"] }).notNull().default("needs_review"),
  source: text("source", { enum: ["pipeline", "manual"] }).notNull().default("pipeline"),
  proposedTitle: text("proposed_title"),
  proposedDescription: text("proposed_description"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  youtubeTitle: text("youtube_title"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });

export const lectureNamesTable = pgTable("lecture_names", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  driveFolderId: text("drive_folder_id"),
  driveFolderName: text("drive_folder_name"),
  youtubePlaylistId: text("youtube_playlist_id"),
  youtubePlaylistName: text("youtube_playlist_name"),
  autoSync: boolean("auto_sync").notNull().default(false),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(60),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
