import { Router } from "express";
import { evaluateAllGroups } from "../lib/autoReviewRun";
import { readMode } from "../lib/autoReviewMode";
import { loadAgreementReport } from "../lib/agreementData";
import { logger } from "../lib/logger";

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
      teacherEvidence: g.verdict.teacherEvidence,
      teachers: g.teachers,
      needsReviewJobIds: g.needsReviewJobIds,
      approvableJobIds: g.verdict.approvableJobIds,
    })),
  });
});

// How often the rules' verdicts agreed with what the reviewer then did, and where the gate for turning the
// rules on stands (issue #27, section 7). Read only. It needs the history table (job_decisions).
router.get("/auto-review/agreement", async (_req, res) => {
  try {
    res.json(await loadAgreementReport());
  } catch (err) {
    logger.error({ err }, "Could not build the agreement report");
    res.status(503).json({ error: "Could not read the history. Is the job_decisions table created? (pnpm --filter @workspace/db run push)" });
  }
});

export default router;
