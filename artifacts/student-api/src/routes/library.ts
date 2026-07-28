import { Router, type Request, type Response } from "express";
import { db, libraryResourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../lib/libraryCategories";

const router: Router = Router();

router.use(requireAuth);

router.get("/library", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: libraryResourcesTable.id,
      driveFileId: libraryResourcesTable.driveFileId,
      title: libraryResourcesTable.title,
      category: libraryResourcesTable.category,
      sizeBytes: libraryResourcesTable.sizeBytes,
    })
    .from(libraryResourcesTable)
    .where(eq(libraryResourcesTable.visible, true));

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = grouped.get(row.category) ?? [];
    bucket.push(row);
    grouped.set(row.category, bucket);
  }

  const categories = CATEGORY_ORDER.filter((code) => grouped.has(code)).map((code) => ({
    code,
    label: CATEGORY_LABELS[code] ?? code,
    resources: grouped.get(code)!,
  }));

  res.json({ categories });
});

export default router;
