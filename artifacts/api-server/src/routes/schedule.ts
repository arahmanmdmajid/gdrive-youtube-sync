import { Router } from "express";
import { db, scheduleSlotsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

const router = Router();

router.get("/schedule", async (_req, res) => {
  const rows = await db
    .select()
    .from(scheduleSlotsTable)
    .orderBy(asc(scheduleSlotsTable.dayOfWeek), asc(scheduleSlotsTable.timeSlot));
  res.json(rows);
});

function parseDayAndTime(params: { dayOfWeek: string; timeSlot: string }): { dayOfWeek: number; timeSlot: string } | null {
  const dayOfWeek = Number(params.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
  if (!/^\d{2}:\d{2}$/.test(params.timeSlot)) return null;
  return { dayOfWeek, timeSlot: params.timeSlot };
}

router.put("/schedule/:dayOfWeek/:timeSlot", async (req, res) => {
  const parsed = parseDayAndTime(req.params as { dayOfWeek: string; timeSlot: string });
  if (!parsed) {
    res.status(400).json({ error: "Invalid dayOfWeek (0-6) or timeSlot (HH:MM)" });
    return;
  }
  const { serial, subjectAr, teacherAr, subjectEn, teacherEn } = req.body ?? {};
  const fields = { serial, subjectAr, teacherAr, subjectEn, teacherEn };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      res.status(400).json({ error: `Invalid body: ${key} must be a non-empty string` });
      return;
    }
  }

  const [existing] = await db
    .select({ id: scheduleSlotsTable.id })
    .from(scheduleSlotsTable)
    .where(and(eq(scheduleSlotsTable.dayOfWeek, parsed.dayOfWeek), eq(scheduleSlotsTable.timeSlot, parsed.timeSlot)));

  const values = {
    serial: serial.trim(),
    subjectAr: subjectAr.trim(),
    teacherAr: teacherAr.trim(),
    subjectEn: subjectEn.trim(),
    teacherEn: teacherEn.trim(),
    updatedAt: new Date(),
  };

  const [row] = existing
    ? await db.update(scheduleSlotsTable).set(values).where(eq(scheduleSlotsTable.id, existing.id)).returning()
    : await db.insert(scheduleSlotsTable).values({ ...values, dayOfWeek: parsed.dayOfWeek, timeSlot: parsed.timeSlot }).returning();

  res.json(row);
});

router.delete("/schedule/:dayOfWeek/:timeSlot", async (req, res) => {
  const parsed = parseDayAndTime(req.params as { dayOfWeek: string; timeSlot: string });
  if (!parsed) {
    res.status(400).json({ error: "Invalid dayOfWeek (0-6) or timeSlot (HH:MM)" });
    return;
  }
  await db
    .delete(scheduleSlotsTable)
    .where(and(eq(scheduleSlotsTable.dayOfWeek, parsed.dayOfWeek), eq(scheduleSlotsTable.timeSlot, parsed.timeSlot)));
  res.status(204).send();
});

export default router;
