import { logger } from "./logger";

export type AutoReviewMode = "off" | "dry_run";

let warnedBadMode = false;

/**
 * AUTO_REVIEW_MODE: "off" (or unset) or "dry_run". Anything else counts as off, so a typo cannot turn
 * anything on. This is an environment variable, not a settings column, on purpose: a new column would
 * make every read of the settings table fail until the schema is pushed.
 */
export function readMode(raw: string | undefined = process.env.AUTO_REVIEW_MODE): AutoReviewMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "" || v === "off") return "off";
  if (v === "dry_run") return "dry_run";
  if (!warnedBadMode) {
    warnedBadMode = true;
    logger.warn({ value: raw }, 'AUTO_REVIEW_MODE must be "off" or "dry_run": treating it as off');
  }
  return "off";
}

export type TeacherMode = "on" | "off";

let warnedBadTeacherMode = false;

/**
 * AUTO_REVIEW_TEACHER: "on" reads recordings' name tiles in the worker tick and lets the dry run use the
 * reads. Unset, empty, "off" or anything else is off, so a typo cannot start reading recordings.
 */
export function readTeacherMode(raw: string | undefined = process.env.AUTO_REVIEW_TEACHER): TeacherMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "on") return "on";
  if (v !== "" && v !== "off" && !warnedBadTeacherMode) {
    warnedBadTeacherMode = true;
    logger.warn({ value: raw }, 'AUTO_REVIEW_TEACHER must be "on" or "off": treating it as off');
  }
  return "off";
}

let warnedBadTitleByTeacher = false;

/**
 * TITLE_BY_TEACHER: "on" proposes titles from the teacher seen on screen (see titleByTeacher.ts) and reads
 * recordings' name tiles to do it. Unset, empty, "off" or anything else is off, so a typo changes nothing.
 */
export function readTitleByTeacher(raw: string | undefined = process.env.TITLE_BY_TEACHER): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "on") return true;
  if (v !== "" && v !== "off" && !warnedBadTitleByTeacher) {
    warnedBadTitleByTeacher = true;
    logger.warn({ value: raw }, 'TITLE_BY_TEACHER must be "on" or "off": treating it as off');
  }
  return false;
}

let warnedBadScreenCheck = false;

/**
 * SCREEN_CHECK: "on" reads the file name in the PDF viewer's toolbar on recordings' shared screens, in the
 * worker tick, to say which book was open. Unset, empty, "off" or anything else is off, so a typo reads nothing.
 */
export function readScreenCheck(raw: string | undefined = process.env.SCREEN_CHECK): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "on") return true;
  if (v !== "" && v !== "off" && !warnedBadScreenCheck) {
    warnedBadScreenCheck = true;
    logger.warn({ value: raw }, 'SCREEN_CHECK must be "on" or "off": treating it as off');
  }
  return false;
}

export const DEFAULT_READS_PER_TICK = 2;
export const MAX_READS_PER_TICK = 10;

/** TEACHER_READS_PER_TICK: how many recordings are read at the end of each tick. 2 unless set, at most 10. */
export function teacherReadsPerTick(raw: string | undefined = process.env.TEACHER_READS_PER_TICK): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1) return DEFAULT_READS_PER_TICK;
  return Math.min(n, MAX_READS_PER_TICK);
}
