import { Router } from "express";
import { db, jobsTable } from "@workspace/db";
import { getDriveClient } from "../lib/driveClient";
import { getSettings } from "../lib/settingsHelper";
import { getSkipReason, BATCH_RECORDING_SIZE_BYTES } from "../lib/filter";

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

    // Paginate to fetch every file in the folder, not just the first 100
    let allFiles: Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string; modifiedTime: string }> = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${settings.driveFolderId}' in parents and mimeType contains 'video/' and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime)",
        orderBy: "createdTime desc",
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
      });
      const page = (response.data.files ?? []) as typeof allFiles;
      allFiles = allFiles.concat(page);
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

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
