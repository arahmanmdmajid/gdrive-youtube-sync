import { Router } from "express";
import { db, libraryResourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListLibraryResourcesQueryParams,
  PatchLibraryResourceParams,
  PatchLibraryResourceBody,
  DeleteLibraryResourceParams,
} from "@workspace/api-zod";
import { scanLibraryFolder } from "../lib/libraryPipeline";

const router = Router();

router.post("/library/scan", async (_req, res) => {
  try {
    const result = await scanLibraryFolder();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

router.get("/library/resources", async (req, res) => {
  const parsed = ListLibraryResourcesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const rows = parsed.data.category
    ? await db.select().from(libraryResourcesTable).where(eq(libraryResourcesTable.category, parsed.data.category))
    : await db.select().from(libraryResourcesTable);
  res.json(rows);
});

router.patch("/library/resources/:id", async (req, res) => {
  const params = PatchLibraryResourceParams.safeParse(req.params);
  const body = PatchLibraryResourceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(libraryResourcesTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(libraryResourcesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json(updated);
});

router.delete("/library/resources/:id", async (req, res) => {
  const params = DeleteLibraryResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [deleted] = await db
    .delete(libraryResourcesTable)
    .where(eq(libraryResourcesTable.id, params.data.id))
    .returning({ id: libraryResourcesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
