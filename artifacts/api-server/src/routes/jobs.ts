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
} from "@workspace/api-zod";
import { runPipelineScan, processJobById, processAllPendingJobs } from "../lib/pipeline";
import { getYoutubeClient } from "../lib/youtubeClient";

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
  await db.delete(jobsTable).where(eq(jobsTable.id, parsed.data.id));
  res.status(204).send();
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
    // Apply status + description update (title was already updated by buildAndAssignTitle)
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
