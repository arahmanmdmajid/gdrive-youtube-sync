import { Router } from "express";
import { db, jobsTable } from "@workspace/db";
import { eq, desc, like, asc } from "drizzle-orm";
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
import { runPipelineScan, processJobById, processAllPendingJobs, reconcilePlaylist } from "../lib/pipeline";
import { getYoutubeClient } from "../lib/youtubeClient";
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

/**
 * When a user manually assigns a lecture name to a job, cascade the change to
 * all subsequent needs_review jobs for the same PKT date + meeting code.
 *
 * Example: schedule has slots [A, B, C, D]. B wasn't recorded, so the pipeline
 * assigned [A, B, C] to the 3 recordings. User changes job[1] from B → C.
 * This function then updates job[2] to D automatically.
 */
async function cascadeSlotAssignment(
  currentJobId: number,
  selectedLectureName: string,
  driveCreatedTime: string,
  driveFileName: string,
): Promise<void> {
  const { dateStr, dayOfWeek } = getPktInfo(driveCreatedTime);
  const meetingCode = extractMeetingCode(driveFileName);
  const slots = getOrderedSlotsForDay(dayOfWeek);
  if (slots.length === 0) return;

  // Match the selected lecture name back to a slot by subjectEn.
  // Lecture name format: "X.X SubjectEn | TeacherEn"
  const nameWithoutSerial = selectedLectureName.replace(/^\d+\.\d+\s+/, "");
  const subjectEn = nameWithoutSerial.split(" | ")[0]?.trim() ?? "";
  const selectedSlotIdx = slots.findIndex(s => s.subjectEn === subjectEn);
  if (selectedSlotIdx < 0) return;

  // Find all needs_review siblings for the same PKT date + meeting code
  const allNeedsReview = await db
    .select({
      id: jobsTable.id,
      driveCreatedTime: jobsTable.driveCreatedTime,
      driveFileName: jobsTable.driveFileName,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "needs_review"));

  const siblings = allNeedsReview
    .filter(j => {
      if (!j.driveCreatedTime) return false;
      const info = getPktInfo(j.driveCreatedTime);
      if (info.dateStr !== dateStr) return false;
      if (meetingCode) {
        const jCode = extractMeetingCode(j.driveFileName ?? "");
        if (jCode !== meetingCode) return false;
      }
      return true;
    })
    .sort((a, b) => (a.driveCreatedTime ?? "").localeCompare(b.driveCreatedTime ?? ""));

  const currentPos = siblings.findIndex(j => j.id === currentJobId);
  if (currentPos < 0) return;

  // Assign the next slots to each subsequent sibling
  for (let i = currentPos + 1; i < siblings.length; i++) {
    const nextSlotIdx = selectedSlotIdx + (i - currentPos);
    if (nextSlotIdx >= slots.length) break;
    const slot = slots[nextSlotIdx];
    const title = buildYoutubeTitleFromSlot(slot, dateStr);
    const description = buildYoutubeDescriptionFromSlot(slot, dateStr, siblings[i].driveFileName ?? "");
    await db.update(jobsTable)
      .set({ proposedTitle: title, proposedDescription: description, updatedAt: new Date() })
      .where(eq(jobsTable.id, siblings[i].id));
  }
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
    // Build title from lecture name + date, assigning part numbers across sibling jobs
    await buildAndAssignTitle(id, bodyParsed.data.lectureName, job.driveCreatedTime ?? null);
    // Cascade: update subsequent same-day needs_review jobs with the next schedule slots
    if (job.driveCreatedTime && job.driveFileName) {
      await cascadeSlotAssignment(id, bodyParsed.data.lectureName, job.driveCreatedTime, job.driveFileName);
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
    await buildAndAssignTitle(id, bodyParsed.data.lectureName, job.driveCreatedTime ?? null);
    // Cascade: update subsequent same-day needs_review jobs with the next schedule slots
    if (job.driveCreatedTime && job.driveFileName) {
      await cascadeSlotAssignment(id, bodyParsed.data.lectureName, job.driveCreatedTime, job.driveFileName);
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
    proposedTitle: j.proposedTitle ?? null,
    proposedDescription: j.proposedDescription ?? null,
    youtubeVideoId: j.youtubeVideoId ?? null,
    youtubeUrl: j.youtubeUrl ?? null,
    youtubeTitle: j.youtubeTitle ?? null,
    errorMessage: j.errorMessage ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export default router;
