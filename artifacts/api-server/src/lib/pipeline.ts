import { db, jobsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient, streamDriveFile } from "./driveClient";
import { getYoutubeClient } from "./youtubeClient";
import { buildYoutubeTitle, buildYoutubeDescription } from "./schedule";
import { logger } from "./logger";

// Only process recordings from these two Google Meet codes
const ALLOWED_MEETING_CODES = ["zeo-iaqz-qqu", "uys-vqbk-mnn"];

// Only files recorded from May 17 2026 onwards (user has already uploaded up to and including May 16)
const CUTOFF_DATE = new Date("2026-05-16T19:00:00Z"); // midnight PKT May 17 = 19:00 UTC May 16

function isAllowedFile(name: string, createdTime: string | null | undefined): boolean {
  const nameLower = name.toLowerCase();
  const hasCode = ALLOWED_MEETING_CODES.some((code) => nameLower.startsWith(code));
  if (!hasCode) return false;
  if (!createdTime) return false;
  return new Date(createdTime) > CUTOFF_DATE;
}

export async function runPipelineScan(): Promise<{
  newJobsCreated: number;
  alreadyQueued: number;
  totalScanned: number;
  filtered: number;
}> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.driveFolderId) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  const drive = getDriveClient();
  if (!drive) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  // Fetch up to 1000 files (paginate if needed)
  let allFiles: Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${settings.driveFolderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime)",
      orderBy: "createdTime desc",
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    const page = (response.data.files ?? []) as typeof allFiles;
    allFiles = allFiles.concat(page);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const totalScanned = allFiles.length;

  // Apply meeting-code and date filters
  const eligible = allFiles.filter(
    (f) => f.id && f.name && isAllowedFile(f.name, f.createdTime)
  );
  const filtered = totalScanned - eligible.length;

  const existingJobs = await db.select({ driveFileId: jobsTable.driveFileId }).from(jobsTable);
  const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));

  let newJobsCreated = 0;
  let alreadyQueued = 0;

  for (const file of eligible) {
    if (!file.id) continue;
    if (queuedIds.has(file.id)) {
      alreadyQueued++;
    } else {
      await db.insert(jobsTable).values({
        driveFileId: file.id,
        driveFileName: file.name ?? "Untitled",
        driveFileSizeBytes: file.size ? parseInt(file.size, 10) : null,
        driveCreatedTime: file.createdTime ?? null,
        status: "pending",
      });
      newJobsCreated++;
    }
  }

  return { newJobsCreated, alreadyQueued, totalScanned, filtered };
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
      throw new Error("YouTube not configured. Please add OAuth credentials.");
    }

    const title = buildYoutubeTitle(job.driveFileName, job.driveCreatedTime);
    const description = buildYoutubeDescription(job.driveFileName, job.driveCreatedTime);

    const fileStream = await streamDriveFile(job.driveFileId);

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "unlisted" },
      },
      media: {
        mimeType: "video/mp4",
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
            resourceId: { kind: "youtube#video", videoId },
          },
        },
      });
    }

    await db.update(jobsTable)
      .set({
        status: "done",
        youtubeVideoId: videoId,
        youtubeUrl,
        youtubeTitle: title,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, job.id));

    logger.info({ jobId: job.id, videoId, title }, "Job completed");
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
