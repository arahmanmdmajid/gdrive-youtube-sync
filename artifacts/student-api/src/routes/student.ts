import { Router, type Request, type Response } from "express";
import { db, jobsTable, lectureProgressTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { SUBJECTS, UNGROUPED_SERIAL, serialForTitle } from "../lib/subjects";
import { progressSchema } from "../zod";

const router: Router = Router();

router.use(requireAuth);

interface LectureRow {
  id: number;
  title: string;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  driveCreatedTime: string | null;
}

async function doneLectures(): Promise<LectureRow[]> {
  const rows = await db
    .select({
      id: jobsTable.id,
      proposedTitle: jobsTable.proposedTitle,
      youtubeTitle: jobsTable.youtubeTitle,
      youtubeVideoId: jobsTable.youtubeVideoId,
      youtubeUrl: jobsTable.youtubeUrl,
      driveCreatedTime: jobsTable.driveCreatedTime,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "done"));

  return rows
    .map((row) => ({
      id: row.id,
      title: row.youtubeTitle ?? row.proposedTitle ?? "Untitled lecture",
      youtubeVideoId: row.youtubeVideoId,
      youtubeUrl: row.youtubeUrl,
      driveCreatedTime: row.driveCreatedTime,
    }))
    .sort((a, b) => (a.driveCreatedTime ?? "").localeCompare(b.driveCreatedTime ?? ""));
}

async function progressMap(userId: number): Promise<Map<number, string>> {
  const rows = await db
    .select({ jobId: lectureProgressTable.jobId, status: lectureProgressTable.status })
    .from(lectureProgressTable)
    .where(eq(lectureProgressTable.userId, userId));
  return new Map(rows.map((r) => [r.jobId, r.status]));
}

router.get("/subjects", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const [lectures, progress] = await Promise.all([doneLectures(), progressMap(userId)]);

  const groups = new Map<string, { total: number; completed: number; inProgress: number; latest: string | null }>();
  for (const lecture of lectures) {
    const serial = serialForTitle(lecture.title);
    const group = groups.get(serial) ?? { total: 0, completed: 0, inProgress: 0, latest: null };
    group.total += 1;
    const status = progress.get(lecture.id);
    if (status === "completed") group.completed += 1;
    else if (status === "in_progress") group.inProgress += 1;
    if (!group.latest || (lecture.driveCreatedTime ?? "") > group.latest) {
      group.latest = lecture.driveCreatedTime;
    }
    groups.set(serial, group);
  }

  const subjects = SUBJECTS.filter((s) => groups.has(s.serial)).map((s) => ({
    ...s,
    ...groups.get(s.serial)!,
  }));
  const ungrouped = groups.get(UNGROUPED_SERIAL);
  if (ungrouped) {
    subjects.push({
      serial: UNGROUPED_SERIAL,
      nameEn: "Earlier lectures",
      teacherEn: "",
      ...ungrouped,
    });
  }

  res.json({ subjects });
});

router.get("/subjects/:serial/lectures", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const serial = req.params.serial!;
  const subject =
    serial === UNGROUPED_SERIAL
      ? { serial: UNGROUPED_SERIAL, nameEn: "Earlier lectures", teacherEn: "" }
      : SUBJECTS.find((s) => s.serial === serial);
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const [lectures, progress] = await Promise.all([doneLectures(), progressMap(userId)]);
  const result = lectures
    .filter((lecture) => serialForTitle(lecture.title) === serial)
    .map((lecture) => ({ ...lecture, progress: progress.get(lecture.id) ?? "not_started" }));

  res.json({ subject, lectures: result });
});

router.put("/progress/:jobId", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const jobId = Number(req.params.jobId);
  const parsed = progressSchema.safeParse(req.body);
  if (!jobId || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { status } = parsed.data;

  const [job] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(and(eq(jobsTable.id, jobId), eq(jobsTable.status, "done")))
    .limit(1);
  if (!job) {
    res.status(404).json({ error: "Lecture not found" });
    return;
  }

  if (status === "not_started") {
    await db
      .delete(lectureProgressTable)
      .where(and(eq(lectureProgressTable.userId, userId), eq(lectureProgressTable.jobId, jobId)));
  } else {
    await db
      .insert(lectureProgressTable)
      .values({ userId, jobId, status })
      .onConflictDoUpdate({
        target: [lectureProgressTable.userId, lectureProgressTable.jobId],
        set: { status, updatedAt: new Date() },
      });
  }

  res.json({ jobId, status });
});

router.get("/class-progress", async (_req: Request, res: Response) => {
  const lectures = await doneLectures();
  const total = lectures.length;

  const rows = await db
    .select({
      userId: usersTable.id,
      displayName: usersTable.displayName,
      completed: sql<number>`count(${lectureProgressTable.id}) filter (where ${lectureProgressTable.status} = 'completed')`,
    })
    .from(usersTable)
    .leftJoin(lectureProgressTable, eq(lectureProgressTable.userId, usersTable.id))
    .groupBy(usersTable.id, usersTable.displayName)
    .orderBy(usersTable.displayName);

  res.json({
    total,
    students: rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      completed: Number(row.completed),
    })),
  });
});

router.get("/continue", async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const [latest] = await db
    .select({ jobId: lectureProgressTable.jobId, updatedAt: lectureProgressTable.updatedAt })
    .from(lectureProgressTable)
    .where(and(eq(lectureProgressTable.userId, userId), eq(lectureProgressTable.status, "in_progress")))
    .orderBy(sql`${lectureProgressTable.updatedAt} desc`)
    .limit(1);

  if (!latest) {
    res.json({ lecture: null });
    return;
  }

  const lectures = await doneLectures();
  const lecture = lectures.find((l) => l.id === latest.jobId) ?? null;
  res.json({
    lecture: lecture ? { ...lecture, serial: serialForTitle(lecture.title) } : null,
  });
});

export default router;
