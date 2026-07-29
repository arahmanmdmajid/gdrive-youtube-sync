import { Router, type Request, type Response } from "express";
import { db, scheduleSlotsTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: Router = Router();

router.use(requireAuth);

router.get("/schedule", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(scheduleSlotsTable)
    .orderBy(asc(scheduleSlotsTable.dayOfWeek), asc(scheduleSlotsTable.timeSlot));
  res.json(rows);
});

export default router;
