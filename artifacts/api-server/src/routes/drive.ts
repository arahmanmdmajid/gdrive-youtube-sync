import { Router } from "express";
import { db, jobsTable, driveSourceFoldersTable } from "@workspace/db";
import { getDriveClient } from "../lib/driveClient";
import { collectVideoFiles } from "../lib/pipeline";
import { getSkipReason, BATCH_RECORDING_SIZE_BYTES } from "../lib/filter";

const router = Router();

// Manual browse/queue view — lists every video across all configured source
// folders (the same driveSourceFoldersTable the automated scan uses), so
// there's one place to manage which folders are watched rather than a
// separate single-folder setting for this page.
router.get("/drive/files", async (req, res) => {
  const sourceFolders = await db.select().from(driveSourceFoldersTable);
  if (sourceFolders.length === 0) {
    res.json([]);
    return;
  }

  try {
    const drive = getDriveClient();
    if (!drive) {
      res.json([]);
      return;
    }

    let allFiles: Awaited<ReturnType<typeof collectVideoFiles>> = [];
    for (const folder of sourceFolders) {
      allFiles = allFiles.concat(await collectVideoFiles(drive, folder.folderId));
    }
    allFiles.sort((a, b) => (b.createdTime ?? "").localeCompare(a.createdTime ?? ""));

    const existingJobs = await db.select({ driveFileId: jobsTable.driveFileId }).from(jobsTable);
    const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));

    res.json(
      allFiles.map((f) => {
        const sizeBytes = f.size ? parseInt(f.size, 10) : null;
        return {
          id: f.id ?? "",
          name: f.name ?? "",
          mimeType: f.mimeType ?? "",
          sizeBytes,
          createdTime: f.createdTime ?? null,
          modifiedTime: f.modifiedTime ?? null,
          alreadyQueued: queuedIds.has(f.id ?? ""),
          skipReason: getSkipReason(f.name ?? "", f.createdTime),
          isSuspiciousSize: sizeBytes !== null && sizeBytes > BATCH_RECORDING_SIZE_BYTES,
        };
      })
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list Drive files");
    res.status(503).json({ error: "Failed to connect to Google Drive" });
  }
});

export default router;
