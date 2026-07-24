import { Router, type Request, type Response } from "express";
import { db, lectureProgressTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, requireAdminRole, hashPassword } from "../lib/auth";
import { getInviteCode, setInviteCode } from "../lib/settings";
import { doneLectures, progressMap, groupBySubject } from "./student";
import { resetPasswordSchema, inviteCodeSchema } from "../zod";

const router: Router = Router();

router.use(requireAuth, requireAdminRole);

router.get("/students", async (_req: Request, res: Response) => {
  const lectures = await doneLectures();
  const total = lectures.length;

  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      createdAt: usersTable.createdAt,
      completed: sql<number>`count(${lectureProgressTable.id}) filter (where ${lectureProgressTable.status} = 'completed')`,
    })
    .from(usersTable)
    .leftJoin(lectureProgressTable, eq(lectureProgressTable.userId, usersTable.id))
    .where(eq(usersTable.role, "student"))
    .groupBy(usersTable.id, usersTable.username, usersTable.displayName, usersTable.createdAt)
    .orderBy(usersTable.displayName);

  res.json({
    total,
    students: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      createdAt: row.createdAt,
      completed: Number(row.completed),
    })),
  });
});

router.get("/students/:id/progress", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [student] = await db
    .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "student")))
    .limit(1);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const [lectures, progress] = await Promise.all([doneLectures(), progressMap(id)]);
  res.json({ student, subjects: groupBySubject(lectures, progress) });
});

router.put("/students/:id/password", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid request" : parsed.error.issues[0]?.message });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "student")))
    .returning({ id: usersTable.id });

  if (!updated) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/students/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "student")))
    .returning({ id: usersTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/invite-code", async (_req: Request, res: Response) => {
  res.json({ inviteCode: await getInviteCode() });
});

router.put("/invite-code", async (req: Request, res: Response) => {
  const parsed = inviteCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid invite code" });
    return;
  }
  const inviteCode = await setInviteCode(parsed.data.inviteCode);
  res.json({ inviteCode });
});

export default router;
