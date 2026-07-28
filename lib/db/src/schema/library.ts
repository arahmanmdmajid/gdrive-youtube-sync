import { pgTable, serial, text, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const libraryResourcesTable = pgTable("library_resources", {
  id: serial("id").primaryKey(),
  driveFileId: text("drive_file_id").notNull().unique(),
  driveFileName: text("drive_file_name").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  visible: boolean("visible").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLibraryResourceSchema = createInsertSchema(libraryResourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLibraryResource = z.infer<typeof insertLibraryResourceSchema>;
export type LibraryResource = typeof libraryResourcesTable.$inferSelect;
