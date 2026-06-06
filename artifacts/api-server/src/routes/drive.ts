import { Router } from "express";
import { db, jobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient } from "../lib/driveClient";
import { getSettings } from "../lib/settingsHelper";

const router = Router();

router.get("/drive/files", async (req, res) => {
  const settings = await getSettings();
  if (!settings?.driveFolderId) {
    res.json([]);
    return;
  }

  try {
    const drive = getDriveClient();
    if (!drive) {
      res.json([]);
      return;
    }

    const response = await drive.files.list({
      q: `'${settings.driveFolderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "files(id,name,mimeType,size,createdTime)",
      orderBy: "createdTime desc",
      pageSize: 100,
    });

    const files = response.data.files ?? [];
    const existingJobs = await db.select({ driveFileId: jobsTable.driveFileId }).from(jobsTable);
    const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));

    res.json(
      files.map((f) => ({
        id: f.id ?? "",
        name: f.name ?? "",
        mimeType: f.mimeType ?? "",
        sizeBytes: f.size ? parseInt(f.size, 10) : null,
        createdTime: f.createdTime ?? null,
        alreadyQueued: queuedIds.has(f.id ?? ""),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list Drive files");
    res.status(503).json({ error: "Failed to connect to Google Drive" });
  }
});

export default router;
