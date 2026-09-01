import { Router } from "express";
import multer from "multer";
import { db, jobsTable } from "@workspace/db";
import { eq, desc, like, asc } from "drizzle-orm";
import fs from "node:fs";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RetryJobParams,
  ApproveJobBody,
  PatchJobBody,
  RenameYoutubeTitleBody,
} from "@workspace/api-zod";
import { runPipelineScan, processJobById, processAllPendingJobs, reconcilePlaylist, isQuotaError, isThumbnailRateLimited } from "../lib/pipeline";
import { scanAudioLibrary } from "../lib/audioPipeline";
import { getYoutubeClient } from "../lib/youtubeClient";
import {
  extractSerial,
  getSubjectThumbnailPath,
  getJobThumbnailPath,
  getThumbnailPathForJob,
  saveJobThumbnail,
  deleteJobThumbnail,
} from "../lib/thumbnails";
import { logger } from "../lib/logger";

const uploadThumbnail = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are supported"));
    }
  },
});
import {
  getPktInfo,
  extractMeetingCode,
  getOrderedSlotsForDay,
  buildYoutubeTitleFromSlot,
  buildYoutubeDescriptionFromSlot,
} from "../lib/schedule";

/** Format a date as DD-MM-YYYY (PKT = UTC+5) */
function formatDateDDMMYYYY(isoString: string): string {
  const d = new Date(isoString);
  // Shift to PKT (UTC+5)
  const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const dd = String(pkt.getUTCDate()).padStart(2, "0");
  const mm = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = pkt.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Given a lectureName and a job, build the full proposed title with date and,
 * if other jobs share the same base title, assign part numbers to all of them.
 * Returns the title that should be applied to the current job (id = currentJobId).
 */
async function buildAndAssignTitle(
  currentJobId: number,
  lectureName: string,
  driveCreatedTime: string | null,
): Promise<string> {
  const dateStr = driveCreatedTime ? formatDateDDMMYYYY(driveCreatedTime) : "00-00-0000";
  const baseTitle = `${lectureName} | ${dateStr}`;

  // Find all jobs (any status) whose title already starts with this base
  const existing = await db
    .select({ id: jobsTable.id, driveCreatedTime: jobsTable.driveCreatedTime })
    .from(jobsTable)
    .where(like(jobsTable.proposedTitle, `${baseTitle}%`));

  // Collect all IDs in this group: existing + the current job (if not already there)
  const ids = new Set(existing.map((r) => r.id));
  ids.add(currentJobId);

  if (ids.size === 1) {
    // Only this job — no part numbers needed
    await db
      .update(jobsTable)
      .set({ proposedTitle: baseTitle, updatedAt: new Date() })
      .where(eq(jobsTable.id, currentJobId));
    return baseTitle;
  }

  // Multiple jobs — fetch full rows for all IDs to get driveCreatedTime for sorting
  const allRows = await db
    .select({ id: jobsTable.id, driveCreatedTime: jobsTable.driveCreatedTime })
    .from(jobsTable)
    .where(like(jobsTable.proposedTitle, `${baseTitle}%`));

  // Also include the current job row in case it doesn't have the base title yet
  const rowMap = new Map(allRows.map((r) => [r.id, r]));

  // Get the current job's driveCreatedTime if not already in the map
  if (!rowMap.has(currentJobId)) {
    const [cur] = await db
      .select({ id: jobsTable.id, driveCreatedTime: jobsTable.driveCreatedTime })
      .from(jobsTable)
      .where(eq(jobsTable.id, currentJobId));
    if (cur) rowMap.set(currentJobId, cur);
  }

  // Sort by driveCreatedTime ascending (nulls last)
  const sorted = [...rowMap.values()].sort((a, b) => {
    if (!a.driveCreatedTime) return 1;
    if (!b.driveCreatedTime) return -1;
    return a.driveCreatedTime.localeCompare(b.driveCreatedTime);
  });

  // Assign part numbers and update all
  for (let i = 0; i < sorted.length; i++) {
    const title = `${baseTitle} | Part ${i + 1}`;
    await db
      .update(jobsTable)
      .set({ proposedTitle: title, updatedAt: new Date() })
      .where(eq(jobsTable.id, sorted[i].id));
  }

  // Return the title assigned to the current job
  const myIndex = sorted.findIndex((r) => r.id === currentJobId);
  return `${baseTitle} | Part ${myIndex + 1}`;
}

type CascadeResult =
  | { matched: false }
  | { matched: true; conflict: { id: number; proposedTitle: string; driveCreatedTime: string | null } }
  | { matched: true };

/**
 * When a user manually assigns a lecture name to a job, apply it — unless another
 * needs_review sibling for the same PKT date + meeting code currently holds that
 * same name (and isn't itself already confirmed), in which case the caller must
 * supply a conflictResolution:
 *   - "swap": the two jobs' titles are exchanged (a genuine two-way trade — two
 *     teachers swapped slots for the day).
 *   - "merge": the conflicting sibling's title is left untouched and it's simply
 *     marked confirmed too (one class split across two recording files — both
 *     genuinely share this name).
 * With no conflictResolution given and a conflict found, nothing is written —
 * the caller is expected to surface the choice and retry.
 *
 * This intentionally does NOT cascade-shift every other sibling on a swap: that's
 * correct for a skipped class, but wrong for a swap or a split recording — and all
 * three look identical from the "new name collides with an existing one" trigger
 * alone. A skip beyond the first colliding pair still needs one more manual
 * correction, same as before any of this cascade logic existed.
 *
 * Returns { matched: false } if the lecture name doesn't correspond to any
 * schedule slot (e.g. audio-only subjects, or a custom name) — the caller should
 * fall back to buildAndAssignTitle's Part-N naming instead.
 */
async function cascadeSlotAssignment(
  currentJobId: number,
  selectedLectureName: string,
  driveCreatedTime: string,
  driveFileName: string,
  conflictResolution?: "swap" | "merge",
): Promise<CascadeResult> {
  const { dateStr, dayOfWeek } = getPktInfo(driveCreatedTime);
  const meetingCode = extractMeetingCode(driveFileName);
  const slots = await getOrderedSlotsForDay(dayOfWeek);
  if (slots.length === 0) return { matched: false };

  // Match the selected lecture name back to a slot by subjectEn.
  // Lecture name format: "X.X SubjectEn | TeacherEn"
  const nameWithoutSerial = selectedLectureName.replace(/^\d+\.\d+\s+/, "");
  const subjectEn = nameWithoutSerial.split(" | ")[0]?.trim() ?? "";
  const selectedSlot = slots.find(s => s.subjectEn === subjectEn);
  if (!selectedSlot) return { matched: false };

  const newTitle = buildYoutubeTitleFromSlot(selectedSlot, dateStr);
  const newDescription = buildYoutubeDescriptionFromSlot(selectedSlot, dateStr, driveFileName);

  const [currentJob] = await db
    .select({ id: jobsTable.id, proposedTitle: jobsTable.proposedTitle, proposedDescription: jobsTable.proposedDescription })
    .from(jobsTable)
    .where(eq(jobsTable.id, currentJobId));
  if (!currentJob) return { matched: false };
  const oldTitle = currentJob.proposedTitle;
  const oldDescription = currentJob.proposedDescription;

  // Find same-day/meeting-code needs_review siblings currently holding the new title.
  const allNeedsReview = await db
    .select({
      id: jobsTable.id,
      driveCreatedTime: jobsTable.driveCreatedTime,
      driveFileName: jobsTable.driveFileName,
      proposedTitle: jobsTable.proposedTitle,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "needs_review"));

  const conflicting = allNeedsReview.find(j => {
    if (j.id === currentJobId) return false;
    if (j.proposedTitle !== newTitle) return false;
    if (j.lectureNameConfirmed) return false; // deliberate repeat — leave it alone
    if (!j.driveCreatedTime) return false;
    const info = getPktInfo(j.driveCreatedTime);
    if (info.dateStr !== dateStr) return false;
    if (meetingCode) {
      const jCode = extractMeetingCode(j.driveFileName ?? "");
      if (jCode !== meetingCode) return false;
    }
    return true;
  });

  if (conflicting && !conflictResolution) {
    return {
      matched: true,
      conflict: { id: conflicting.id, proposedTitle: conflicting.proposedTitle ?? "", driveCreatedTime: conflicting.driveCreatedTime },
    };
  }

  if (conflicting && conflictResolution === "swap" && oldTitle) {
    await db.update(jobsTable)
      .set({ proposedTitle: oldTitle, proposedDescription: oldDescription, updatedAt: new Date() })
      .where(eq(jobsTable.id, conflicting.id));
  } else if (conflicting && conflictResolution === "merge") {
    await db.update(jobsTable)
      .set({ lectureNameConfirmed: true, updatedAt: new Date() })
      .where(eq(jobsTable.id, conflicting.id));
  }

  await db.update(jobsTable)
    .set({ proposedTitle: newTitle, proposedDescription: newDescription, lectureNameConfirmed: true, updatedAt: new Date() })
    .where(eq(jobsTable.id, currentJobId));

  return { matched: true };
}

const router = Router();

router.get("/jobs", async (req, res) => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { status } = parsed.data;
  let query = db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
  if (status) {
    const rows = await db.select().from(jobsTable).where(eq(jobsTable.status, status)).orderBy(desc(jobsTable.createdAt));
    res.json(rows.map(formatJob));
    return;
  }
  const rows = await query;
  res.json(rows.map(formatJob));
});

router.post("/jobs", async (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { driveFileId, driveFileName, driveFileSizeBytes } = parsed.data;
  const existing = await db.select().from(jobsTable).where(eq(jobsTable.driveFileId, driveFileId));
  if (existing.length > 0) {
    res.status(409).json({ error: "Job already exists for this file" });
    return;
  }
  const [job] = await db.insert(jobsTable).values({
    driveFileId,
    driveFileName,
    driveFileSizeBytes: driveFileSizeBytes ?? null,
    status: "pending",
  }).returning();
  res.status(201).json(formatJob(job));
});

router.get("/jobs/:id", async (req, res) => {
  const parsed = GetJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(formatJob(job));
});

router.delete("/jobs/:id", async (req, res) => {
  const parsed = DeleteJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Soft-delete needs_review jobs so the pipeline won't re-scan them
  if (job.status === "needs_review") {
    const [updated] = await db
      .update(jobsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(jobsTable.id, parsed.data.id))
      .returning();
    res.json(formatJob(updated));
    return;
  }
  await db.delete(jobsTable).where(eq(jobsTable.id, parsed.data.id));
  res.status(204).send();
});

// Restore a rejected job back to the approval queue
router.post("/jobs/:id/restore", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "rejected") {
    res.status(409).json({ error: "Job is not rejected" });
    return;
  }
  const [updated] = await db
    .update(jobsTable)
    .set({ status: "needs_review", updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning();
  res.json(formatJob(updated));
});

// Delete the YouTube video for a job and remove the job from DB
router.delete("/jobs/:id/youtube", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.youtubeVideoId) {
    const youtube = getYoutubeClient();
    if (youtube) {
      try {
        await youtube.videos.delete({ id: job.youtubeVideoId });
      } catch (_err) {
        // Video may already be gone — proceed with DB cleanup regardless
      }
    }
  }
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.json({ deleted: true, jobId: id, youtubeVideoId: job.youtubeVideoId ?? null });
});

// Approve a needs_review job: optionally update proposed title/description, then move to pending
router.post("/jobs/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = ApproveJobBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "needs_review") {
    res.status(409).json({ error: "Job is not in needs_review status" });
    return;
  }
  const updates: Record<string, unknown> = { status: "pending", updatedAt: new Date() };
  if (bodyParsed.data.proposedDescription !== undefined) updates.proposedDescription = bodyParsed.data.proposedDescription;

  if (bodyParsed.data.lectureName) {
    // Retitle the whole same-day/meeting-code group anchored on this job's corrected
    // slot. Meaningless for audio (no Meet-schedule slot concept), so only attempted
    // for video; falls back to Part-N naming if the lecture name doesn't match any
    // schedule subject.
    let cascadeResult: Awaited<ReturnType<typeof cascadeSlotAssignment>> = { matched: false };
    if (job.contentType !== "audio" && job.driveCreatedTime && job.driveFileName) {
      cascadeResult = await cascadeSlotAssignment(
        id, bodyParsed.data.lectureName, job.driveCreatedTime, job.driveFileName, bodyParsed.data.conflictResolution,
      );
    }
    if (cascadeResult.matched && "conflict" in cascadeResult) {
      res.status(409).json({ conflict: true, conflictingJob: cascadeResult.conflict });
      return;
    }
    if (!cascadeResult.matched) {
      await buildAndAssignTitle(id, bodyParsed.data.lectureName, job.driveCreatedTime ?? null);
    }
    await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id));
  } else {
    if (bodyParsed.data.proposedTitle !== undefined) updates.proposedTitle = bodyParsed.data.proposedTitle;
    await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id));
  }

  const [updated] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  res.json(formatJob(updated));
});

// Edit proposed title/description for a needs_review or pending job (without changing its status)
router.patch("/jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = PatchJobBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!["needs_review", "pending"].includes(job.status)) {
    res.status(409).json({ error: "Can only edit jobs with needs_review or pending status" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bodyParsed.data.proposedDescription !== undefined) updates.proposedDescription = bodyParsed.data.proposedDescription;

  if (bodyParsed.data.lectureName) {
    // Retitle the whole same-day/meeting-code group anchored on this job's corrected
    // slot. Meaningless for audio (no Meet-schedule slot concept), so only attempted
    // for video; falls back to Part-N naming if the lecture name doesn't match any
    // schedule subject.
    let cascadeResult: Awaited<ReturnType<typeof cascadeSlotAssignment>> = { matched: false };
    if (job.contentType !== "audio" && job.driveCreatedTime && job.driveFileName) {
      cascadeResult = await cascadeSlotAssignment(
        id, bodyParsed.data.lectureName, job.driveCreatedTime, job.driveFileName, bodyParsed.data.conflictResolution,
      );
    }
    if (cascadeResult.matched && "conflict" in cascadeResult) {
      res.status(409).json({ conflict: true, conflictingJob: cascadeResult.conflict });
      return;
    }
    if (!cascadeResult.matched) {
      await buildAndAssignTitle(id, bodyParsed.data.lectureName, job.driveCreatedTime ?? null);
    }
    if (Object.keys(updates).length > 1) {
      await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id));
    }
  } else {
    if (bodyParsed.data.proposedTitle !== undefined) updates.proposedTitle = bodyParsed.data.proposedTitle;
    await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id));
  }

  const [updated] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  res.json(formatJob(updated));
});

// Rename the YouTube title of a done job. Fetches the current snippet first
// because YouTube's videos.update with part=snippet requires the *entire*
// snippet object — omitted fields (description, categoryId, tags) get wiped.
router.patch("/jobs/:id/youtube-title", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = RenameYoutubeTitleBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { title } = bodyParsed.data;

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "done") {
    res.status(409).json({ error: "Can only rename the YouTube title of a done job" });
    return;
  }
  if (!job.youtubeVideoId) {
    res.status(409).json({ error: "Job has no associated YouTube video" });
    return;
  }

  const youtube = getYoutubeClient();
  if (!youtube) {
    res.status(503).json({ error: "YouTube not configured" });
    return;
  }

  try {
    const current = await youtube.videos.list({ part: ["snippet"], id: [job.youtubeVideoId] });
    const existingSnippet = current.data.items?.[0]?.snippet;
    if (!existingSnippet) {
      res.status(502).json({ error: "Video not found on YouTube (it may have been deleted)" });
      return;
    }
    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: job.youtubeVideoId,
        snippet: { ...existingSnippet, title },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to update YouTube title: ${message}` });
    return;
  }

  const [updated] = await db
    .update(jobsTable)
    .set({ youtubeTitle: title, updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning();
  res.json(formatJob(updated));
});

// Apply the admin-provided per-subject thumbnail to a single done job's YouTube video
router.post("/jobs/:id/thumbnail", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "done" || !job.youtubeVideoId) {
    res.status(409).json({ error: "Job must be done with a YouTube video to set a thumbnail" });
    return;
  }
  const serial = extractSerial(job.proposedTitle ?? "");
  const thumbPath = serial ? getSubjectThumbnailPath(serial) : null;
  if (!thumbPath) {
    res.status(404).json({ error: serial ? `No thumbnail configured for subject ${serial}` : "Could not determine subject serial from title" });
    return;
  }
  const youtube = getYoutubeClient();
  if (!youtube) {
    res.status(503).json({ error: "YouTube not configured" });
    return;
  }
  try {
    await youtube.thumbnails.set({
      videoId: job.youtubeVideoId,
      media: { body: fs.createReadStream(thumbPath) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to set thumbnail: ${message}` });
    return;
  }
  // Explicitly choosing the subject default clears any prior per-video
  // override — otherwise a later bulk apply would silently resurrect it.
  deleteJobThumbnail(id);
  res.json({ applied: true, jobId: id, serial });
});

// Upload a one-off custom thumbnail for a single video (takes priority over
// the subject default, including on future bulk applies).
router.post("/jobs/:id/thumbnail/upload", uploadThumbnail.single("image"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "done" || !job.youtubeVideoId) {
    res.status(409).json({ error: "Job must be done with a YouTube video to set a thumbnail" });
    return;
  }
  const youtube = getYoutubeClient();
  if (!youtube) {
    res.status(503).json({ error: "YouTube not configured" });
    return;
  }
  const thumbPath = saveJobThumbnail(id, req.file.buffer, req.file.mimetype);
  try {
    await youtube.thumbnails.set({
      videoId: job.youtubeVideoId,
      media: { body: fs.createReadStream(thumbPath) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to set thumbnail: ${message}` });
    return;
  }
  res.json({ applied: true, jobId: id, custom: true });
});

// Remove a job's custom thumbnail override (does not re-apply the subject
// default automatically — use POST /jobs/:id/thumbnail for that).
router.delete("/jobs/:id/thumbnail/custom", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  deleteJobThumbnail(id);
  res.status(204).send();
});

// Restore a "removed" job back to "done" after the admin manually re-adds the
// video to the playlist. DB-only — does not touch YouTube.
router.post("/jobs/:id/restore-done", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.status !== "removed") {
    res.status(409).json({ error: "Job is not removed" });
    return;
  }
  const [updated] = await db
    .update(jobsTable)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning();
  res.json(formatJob(updated));
});

// Re-sync jobs against the current YouTube playlist: mark done jobs whose
// video left the playlist as removed, self-heal removed jobs whose video
// reappeared, and backfill jobs for playlist videos with no job at all.
router.post("/pipeline/reconcile-playlist", async (req, res) => {
  const result = await reconcilePlaylist();
  res.json(result);
});

// Trigger upload for a specific pending job (runs in background, returns immediately)
router.post("/jobs/:id/process", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const started = await processJobById(id);
  if (!started) {
    res.status(404).json({ error: "Job not found or not in pending status" });
    return;
  }
  res.json({ started: true, jobId: id });
});

router.post("/jobs/:id/retry", async (req, res) => {
  const parsed = RetryJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [updated] = await db.update(jobsTable)
    .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
    .where(eq(jobsTable.id, parsed.data.id))
    .returning();
  res.json(formatJob(updated));
});

router.post("/pipeline/trigger", async (req, res) => {
  const result = await runPipelineScan();
  res.json(result);
});

router.post("/pipeline/scan-audio", async (req, res) => {
  try {
    const result = await scanAudioLibrary();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

// Apply the admin-provided per-subject thumbnails to every done job (video and
// audio alike). Idempotent — safe to re-run any time new thumbnails are added.
router.post("/pipeline/apply-thumbnails", async (req, res) => {
  const youtube = getYoutubeClient();
  if (!youtube) {
    res.status(503).json({ error: "YouTube not configured" });
    return;
  }

  const doneJobs = await db
    .select({ id: jobsTable.id, proposedTitle: jobsTable.proposedTitle, youtubeVideoId: jobsTable.youtubeVideoId })
    .from(jobsTable)
    .where(eq(jobsTable.status, "done"));

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of doneJobs) {
    if (!job.youtubeVideoId) {
      skipped++;
      continue;
    }
    const thumbPath = getThumbnailPathForJob(job);
    if (!thumbPath) {
      skipped++;
      continue;
    }
    try {
      await youtube.thumbnails.set({
        videoId: job.youtubeVideoId,
        media: { body: fs.createReadStream(thumbPath) },
      });
      applied++;
    } catch (err) {
      if (isQuotaError(err) || isThumbnailRateLimited(err)) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ applied, skipped, failed, message }, "Bulk thumbnail apply stopped: rate-limited — re-run later");
        break;
      }
      logger.warn({ jobId: job.id, err }, "Bulk thumbnail apply: failed for job, continuing");
      failed++;
    }
  }

  res.json({ applied, skipped, failed });
});

// Start uploading all pending jobs in chronological order (runs in background)
router.post("/pipeline/upload", async (req, res) => {
  const pending = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(eq(jobsTable.status, "pending"));

  const count = pending.length;
  if (count === 0) {
    res.json({ started: 0, message: "No pending jobs to upload" });
    return;
  }

  // Respond immediately — uploads run in background, one at a time, in order
  res.json({ started: count, message: `Uploading ${count} pending job${count === 1 ? "" : "s"} in background` });

  setImmediate(() => {
    processAllPendingJobs().catch((err) =>
      console.error("processAllPendingJobs error:", err)
    );
  });
});

// Clear all jobs (reset) so a fresh scan can re-queue everything
router.delete("/jobs", async (req, res) => {
  await db.delete(jobsTable);
  res.status(204).send();
});

router.get("/pipeline/stats", async (req, res) => {
  const rows = await db.select().from(jobsTable);
  const stats = { needs_review: 0, pending: 0, processing: 0, done: 0, failed: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "needs_review") stats.needs_review++;
    else if (r.status === "pending") stats.pending++;
    else if (r.status === "processing") stats.processing++;
    else if (r.status === "done") stats.done++;
    else if (r.status === "failed") stats.failed++;
  }
  res.json(stats);
});

function formatJob(j: typeof jobsTable.$inferSelect) {
  return {
    id: j.id,
    driveFileId: j.driveFileId,
    driveFileName: j.driveFileName,
    driveFileSizeBytes: j.driveFileSizeBytes ?? null,
    driveCreatedTime: j.driveCreatedTime ?? null,
    status: j.status,
    source: j.source,
    contentType: j.contentType,
    proposedTitle: j.proposedTitle ?? null,
    proposedDescription: j.proposedDescription ?? null,
    youtubeVideoId: j.youtubeVideoId ?? null,
    youtubeUrl: j.youtubeUrl ?? null,
    youtubeTitle: j.youtubeTitle ?? null,
    errorMessage: j.errorMessage ?? null,
    hasCustomThumbnail: getJobThumbnailPath(j.id) !== null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export default router;
