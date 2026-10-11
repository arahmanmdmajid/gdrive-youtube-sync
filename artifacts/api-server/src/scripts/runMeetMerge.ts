// Entry point for the scheduled GitHub Actions job: one merge + cleanup pass, then exit.
import { getDriveClient } from "../lib/driveClient";
import { logger } from "../lib/logger";
import { runMeetMerge } from "../lib/meetConsolidation";

const target = process.env.DRIVE_CONSOLIDATE_TARGET_FOLDER_ID;
const drive = getDriveClient();
if (!target || !drive) {
  logger.error({ hasTarget: !!target, hasDrive: !!drive }, "Meet merge: missing target folder or Drive credentials");
  process.exit(1);
}

const { consolidation, cleanup } = await runMeetMerge(drive, target);
// Exit explicitly: the database pool keeps the process alive otherwise. Non-zero marks the run failed.
process.exit(consolidation.failed + cleanup.failed > 0 ? 1 : 0);
