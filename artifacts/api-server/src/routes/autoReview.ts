import { Router } from "express";
import { evaluateAllGroups } from "../lib/autoReviewRun";
import { readMode } from "../lib/autoReviewMode";

const router = Router();

// What the day-approval rules say right now, computed live. Read only: nothing is written and no job
// changes, whatever AUTO_REVIEW_MODE is.
router.get("/auto-review/groups", async (_req, res) => {
  const groups = await evaluateAllGroups();
  res.json({
    mode: readMode(),
    groups: groups.map((g) => ({
      group: g.key,
      date: g.date,
      meetingCode: g.meetingCode,
      verdict: g.verdict.verdict,
      fileCount: g.fileCount,
      reasons: g.verdict.reasons,
      splitCount: g.verdict.splitCount,
      lectures: g.verdict.lectures,
      titleChanges: g.verdict.titleChanges,
      readings: g.verdict.readings,
      alternatives: g.verdict.alternatives,
      needsReviewJobIds: g.needsReviewJobIds,
      approvableJobIds: g.verdict.approvableJobIds,
    })),
  });
});

export default router;
