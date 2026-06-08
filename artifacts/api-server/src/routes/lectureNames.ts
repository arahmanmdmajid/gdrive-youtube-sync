import { Router } from "express";
import { db, lectureNamesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/lecture-names", async (_req, res) => {
  const rows = await db.select().from(lectureNamesTable).orderBy(asc(lectureNamesTable.name));
  res.json(rows);
});

router.post("/lecture-names", async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 200) {
    res.status(400).json({ error: "Invalid body: name must be a non-empty string (max 200 chars)" });
    return;
  }
  const trimmed = name.trim();
  const existing = await db.select().from(lectureNamesTable).where(eq(lectureNamesTable.name, trimmed));
  if (existing.length > 0) {
    res.status(409).json({ error: "Lecture name already exists" });
    return;
  }
  const [row] = await db.insert(lectureNamesTable).values({ name: trimmed }).returning();
  res.status(201).json(row);
});

router.patch("/lecture-names/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const name = req.body?.name;
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 200) {
    res.status(400).json({ error: "Invalid body: name must be a non-empty string (max 200 chars)" });
    return;
  }
  const trimmed = name.trim();
  const conflict = await db.select().from(lectureNamesTable).where(eq(lectureNamesTable.name, trimmed));
  if (conflict.length > 0 && conflict[0].id !== id) {
    res.status(409).json({ error: "Another lecture name with this text already exists" });
    return;
  }
  const [updated] = await db
    .update(lectureNamesTable)
    .set({ name: trimmed })
    .where(eq(lectureNamesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.delete("/lecture-names/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(lectureNamesTable).where(eq(lectureNamesTable.id, id));
  res.status(204).send();
});

export default router;
