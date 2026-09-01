import { Router } from "express";
import { db, driveSourceFoldersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { getDriveClient } from "../lib/driveClient";

const router = Router();

/** Accepts a raw Drive folder ID or a full folder URL and returns the ID. */
function extractFolderId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

router.get("/drive-folders", async (_req, res) => {
  const rows = await db.select().from(driveSourceFoldersTable).orderBy(asc(driveSourceFoldersTable.createdAt));
  res.json(rows);
});

router.post("/drive-folders", async (req, res) => {
  const raw = req.body?.folderId;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    res.status(400).json({ error: "Invalid body: folderId is required" });
    return;
  }
  const folderId = extractFolderId(raw);
  if (!folderId) {
    res.status(400).json({ error: "Could not parse a folder ID from that input" });
    return;
  }

  const existing = await db.select().from(driveSourceFoldersTable).where(eq(driveSourceFoldersTable.folderId, folderId));
  if (existing.length > 0) {
    res.status(409).json({ error: "This folder is already configured" });
    return;
  }

  const drive = getDriveClient();
  if (!drive) {
    res.status(503).json({ error: "Google Drive not configured" });
    return;
  }

  let folderName: string | null = null;
  try {
    const meta = await drive.files.get({ fileId: folderId, fields: "id,name" });
    folderName = meta.data.name ?? null;
  } catch {
    res.status(400).json({ error: "Could not access that Drive folder — check the ID and sharing permissions" });
    return;
  }

  const [row] = await db.insert(driveSourceFoldersTable).values({ folderId, folderName }).returning();
  res.status(201).json(row);
});

router.delete("/drive-folders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(driveSourceFoldersTable).where(eq(driveSourceFoldersTable.id, id));
  res.status(204).send();
});

export default router;
