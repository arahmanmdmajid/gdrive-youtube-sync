import { Router } from "express";
import { db, jobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RetryJobParams,
} from "@workspace/api-zod";
import { runPipelineScan } from "../lib/pipeline";

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

// Clear all jobs (reset) so a fresh scan can re-queue everything
router.delete("/jobs", async (req, res) => {
  await db.delete(jobsTable);
  res.status(204).send();
});

router.get("/pipeline/stats", async (req, res) => {
  const rows = await db.select().from(jobsTable);
  const stats = { pending: 0, processing: 0, done: 0, failed: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "pending") stats.pending++;
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
    youtubeVideoId: j.youtubeVideoId ?? null,
    youtubeUrl: j.youtubeUrl ?? null,
    youtubeTitle: j.youtubeTitle ?? null,
    errorMessage: j.errorMessage ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export default router;
