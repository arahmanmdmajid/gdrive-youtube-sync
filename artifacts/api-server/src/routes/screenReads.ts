import { Router } from "express";
import { listScreenReads, runScreenReads, DEFAULT_SCREEN_RUN_LIMIT, MAX_SCREEN_RUN_LIMIT } from "../lib/screenReads";

const router = Router();

// The stored results of the screen reads. Only verdicts: no frames and no text exist to show.
router.get("/screen-reads", async (_req, res) => {
  res.json(await listScreenReads());
});

// Reads up to ?limit recordings now (default 1, at most 5) and returns counts and the subjects found.
router.post("/screen-reads/run", async (req, res) => {
  const asked = Number(req.query.limit ?? DEFAULT_SCREEN_RUN_LIMIT);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_SCREEN_RUN_LIMIT) : DEFAULT_SCREEN_RUN_LIMIT;
  const summary = await runScreenReads(limit);
  res.status(summary.skipped === "a run is already in progress" ? 409 : 200).json(summary);
});

export default router;
