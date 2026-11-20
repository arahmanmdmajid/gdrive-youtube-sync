import { Router } from "express";
import { evaluateAllGroups } from "../lib/autoReviewRun";
import { readMode } from "../lib/autoReviewMode";
import { loadAgreementReport } from "../lib/agreementData";
import { loadScreenAgreementReport } from "../lib/screenAgreementData";
import { loadTeacherAgreementReport } from "../lib/teacherAgreementData";
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

// How often the screen check named a subject that the job's final title agrees with (issue #105). Read only.
// It compares jobs that left review with the read made while they were in review.
router.get("/auto-review/screen-agreement", async (_req, res) => {
  try {
    res.json(await loadScreenAgreementReport());
  } catch (err) {
    logger.error({ err }, "Could not build the screen agreement report");
    res.status(503).json({ error: "Could not read the screen reads." });
  }
});

// Same for the teacher read: does the teacher in the final title match the one the name tile showed (issue #105).
router.get("/auto-review/teacher-agreement", async (_req, res) => {
  try {
    res.json(await loadTeacherAgreementReport());
  } catch (err) {
    logger.error({ err }, "Could not build the teacher agreement report");
    res.status(503).json({ error: "Could not read the teacher reads." });
  }
});

export default router;
