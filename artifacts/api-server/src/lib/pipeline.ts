import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient, streamDriveFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import { logger } from "./logger";

export async function runPipelineScan(): Promise<{
  newJobsCreated: number;
  alreadyQueued: number;
  totalScanned: number;
}> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.driveFolderId) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0 };
  }

  const drive = getDriveClient();
  if (!drive) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0 };
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

  let newJobsCreated = 0;
  let alreadyQueued = 0;

  for (const file of files) {
    if (!file.id) continue;
    if (queuedIds.has(file.id)) {
      alreadyQueued++;
    } else {
      await db.insert(jobsTable).values({
        driveFileId: file.id,
        driveFileName: file.name ?? "Untitled",
        driveFileSizeBytes: file.size ? parseInt(file.size, 10) : null,
        status: "pending",
      });
      newJobsCreated++;
    }
  }

  return { newJobsCreated, alreadyQueued, totalScanned: files.length };
}

export async function processNextPendingJob() {
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.status, "pending"))
    .limit(1);

  if (!job) return null;

  await db.update(jobsTable)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(jobsTable.id, job.id));

  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    const youtube = getYoutubeClient();

    if (!youtube) {
      throw new Error("YouTube not configured. Please connect your YouTube account.");
    }

    const fileStream = await streamDriveFile(job.driveFileId);

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: job.driveFileName,
          description: `Uploaded automatically from Google Drive by the recording pipeline.`,
        },
        status: {
          privacyStatus: "unlisted",
        },
      },
      media: {
        mimeType: "video/*",
        body: fileStream,
      },
    });

    const videoId = uploadResponse.data.id ?? "";
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (settings?.youtubePlaylistId && videoId) {
      await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: settings.youtubePlaylistId,
            resourceId: {
              kind: "youtube#video",
              videoId,
            },
          },
        },
      });
    }

    await db.update(jobsTable)
      .set({ status: "done", youtubeVideoId: videoId, youtubeUrl, updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));

    logger.info({ jobId: job.id, videoId }, "Job completed");
    return job.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err }, "Job failed");
    await db.update(jobsTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));
    return null;
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startPipelineWorker() {
  if (workerInterval) return;
  workerInterval = setInterval(async () => {
    try {
      const [settings] = await db.select().from(settingsTable).limit(1);
      if (!settings?.autoSync) return;
      await runPipelineScan();
      await processNextPendingJob();
    } catch (err) {
      logger.error({ err }, "Pipeline worker error");
    }
  }, 60_000);
  logger.info("Pipeline worker started");
}
