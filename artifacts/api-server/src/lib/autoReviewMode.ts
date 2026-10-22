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
