import { db, jobsTable, driveSourceFoldersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient, listChildren, listTopLevelMeetFolders, FOLDER_MIME_TYPE, type DriveChildFile } from "./driveClient";
import { buildYoutubeTitle, buildYoutubeDescription, extractMeetingCode, getPktInfo } from "./schedule";
import { isEligible, BATCH_RECORDING_SIZE_BYTES } from "./filter";
import { logger } from "./logger";
import { computeGroupAssignments, type GroupMember } from "./titles";

/**
 * Collects candidate video files from a Drive source folder, handling both
 * layouts Google Meet has used: files landing directly in the folder (flat),
 * and — more recently — one subfolder per persistent meeting code (nested),
 * which also mixes in "Notes by Gemini" docs and chat-transcript text files
 * alongside the recordings (harmless — the video mimeType filter excludes
 * them). Only descends into subfolders whose name starts with a known class
 * meeting code; every other subfolder is an unrelated Meet call swept into
 * the same account-wide auto-save folder and is left alone.
 */
export async function collectVideoFiles(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  folderId: string,
): Promise<DriveChildFile[]> {
  const direct = await listChildren(drive, folderId, "mimeType contains 'video/'");
  const subfolders = await listChildren(drive, folderId, `mimeType = '${FOLDER_MIME_TYPE}'`);
  const matched = subfolders.filter((f) => extractMeetingCode(f.name) !== null);
  const nested = await Promise.all(
    matched.map((f) => listChildren(drive, f.id, "mimeType contains 'video/'")),
  );
  return [...direct, ...nested.flat()];
}

/**
 * Registers any top-level "Google Meet" folder the Drive account can see that isn't in
 * driveSourceFoldersTable yet, so a day's recordings are scanned before the daily
 * consolidation moves them. Only finds folders owned by the account behind
 * GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN; a plain search can't see folders merely link-shared
 * with it. Runs at the start of every scan.
 *
 * Folders are deliberately not link-shared: sharing a Meet folder makes Meet start a new
 * one at the next recording. Public access comes from the one shared consolidation target.
 */
export async function discoverDriveSourceFolders(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
): Promise<{ discovered: number }> {
  const found = await listTopLevelMeetFolders(drive);
  const existing = await db.select({ folderId: driveSourceFoldersTable.folderId }).from(driveSourceFoldersTable);
  const known = new Set(existing.map((f) => f.folderId));

  let discovered = 0;
  for (const { id } of found) {
    if (known.has(id)) continue;
    await db.insert(driveSourceFoldersTable).values({ folderId: id, folderName: "Google Meet" });
    discovered++;
  }
  if (discovered > 0) logger.info({ discovered }, "Registered new Google Meet folders");
  return { discovered };
}

export async function runPipelineScan(): Promise<{
  newJobsCreated: number;
  alreadyQueued: number;
  totalScanned: number;
  filtered: number;
}> {
  const drive = getDriveClient();
  if (!drive) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  try {
    await discoverDriveSourceFolders(drive);
  } catch (err) {
    // Discovery is additive: folders already registered must still be scanned.
    logger.warn({ err }, "Drive folder discovery failed — scanning registered folders only");
  }

  const sourceFolders = await db.select().from(driveSourceFoldersTable);
  if (sourceFolders.length === 0) {
    return { newJobsCreated: 0, alreadyQueued: 0, totalScanned: 0, filtered: 0 };
  }

  let allFiles: DriveChildFile[] = [];
  for (const folder of sourceFolders) {
    allFiles = allFiles.concat(await collectVideoFiles(drive, folder.folderId));
  }

  const totalScanned = allFiles.length;

  const eligible = allFiles.filter(
    (f) => f.id && f.name && isEligible(f.name, f.createdTime)
  );
  const filtered = totalScanned - eligible.length;

  // ── Load existing jobs ────────────────────────────────────────────────────
  const existingJobs = await db
    .select({
      id: jobsTable.id,
      driveFileId: jobsTable.driveFileId,
      status: jobsTable.status,
      proposedTitle: jobsTable.proposedTitle,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
      durationSeconds: jobsTable.durationSeconds,
    })
    .from(jobsTable);
  const queuedIds = new Set(existingJobs.map((j) => j.driveFileId));
  const existingByFileId = new Map(existingJobs.map((j) => [j.driveFileId, j]));

  // ── Positional slot assignment ────────────────────────────────────────────
  // Group files by (PKT date, meeting code), sort each group by createdTime
  // ascending, then assign schedule slots positionally:
  //   position 0 → first available slot of the day, position 1 → next, etc.
  // This is timezone-safe: the schedule is in PKT; we shift UTC→PKT before
  // extracting the date and day-of-week, so a KSA-recorded file that crosses
  // a UTC midnight still lands on the correct PKT calendar day.
  //
  // "Available" excludes slot names already manually confirmed for that day
  // (lectureNameConfirmed) — those jobs are left untouched entirely, and their
  // slot is removed from the pool so nothing else gets auto-suggested the same
  // name. Non-confirmed files (new or previously auto-guessed) draw positionally
  // from whatever's left, same as before.

  type GroupEntry = {
    pktDateStr: string;
    dayOfWeek: number;
    meetingCode: string | null;
    files: typeof eligible;
  };
  const groupMap = new Map<string, GroupEntry>();
  for (const file of eligible) {
    if (!file.createdTime) continue;
    const { dateStr, dayOfWeek } = getPktInfo(file.createdTime);
    const meetingCode = extractMeetingCode(file.name ?? "");
    const key = `${dateStr}||${meetingCode ?? "none"}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { pktDateStr: dateStr, dayOfWeek, meetingCode, files: [] });
    }
    groupMap.get(key)!.files.push(file);
  }
  for (const group of groupMap.values()) {
    group.files.sort(
      (a, b) => new Date(a.createdTime ?? 0).getTime() - new Date(b.createdTime ?? 0).getTime()
    );
  }

  // Map driveFileId → { title, description } for every eligible, non-confirmed file
  const positionalAssignments = new Map<string, { title: string; description: string }>();
  for (const group of groupMap.values()) {
    const members: GroupMember[] = group.files
      .filter((f): f is typeof f & { id: string; createdTime: string } => Boolean(f.id && f.createdTime))
      .map((f) => {
        const existing = existingByFileId.get(f.id);
        return {
          id: f.id,
          driveFileName: f.name ?? f.id,
          driveCreatedTime: f.createdTime,
          currentTitle: existing?.proposedTitle ?? null,
          locked: existing
            ? existing.lectureNameConfirmed || (existing.status !== "needs_review" && existing.status !== "rejected")
            : false,
        };
      });
    const groupAssignments = await computeGroupAssignments(group.dayOfWeek, group.pktDateStr, group.meetingCode, members);
    for (const [id, assignment] of groupAssignments) {
      positionalAssignments.set(id, assignment);
    }
  }

  // ── Re-title existing needs_review jobs with corrected positional names ───
  // Manually confirmed jobs have no entry in positionalAssignments (see above)
  // and are skipped here, so a rescan never undoes an admin's correction.
  for (const existing of existingJobs) {
    if (existing.status !== "needs_review") continue;
    const assignment = positionalAssignments.get(existing.driveFileId);
    if (!assignment) continue;
    await db
      .update(jobsTable)
      .set({ proposedTitle: assignment.title, proposedDescription: assignment.description, updatedAt: new Date() })
      .where(eq(jobsTable.id, existing.id));
  }

  let newJobsCreated = 0;
  let alreadyQueued = 0;

  for (const file of eligible) {
    if (!file.id) continue;
    const durationMillis = file.videoMediaMetadata?.durationMillis;
    const durationSeconds = durationMillis ? Math.round(parseInt(durationMillis, 10) / 1000) : null;
    if (queuedIds.has(file.id)) {
      alreadyQueued++;
      // Drive works out a video's length a little after upload, so a file scanned right after a
      // recording ends has no duration yet and the job is created without one. Fill it in later.
      const existing = existingByFileId.get(file.id);
      if (existing && existing.durationSeconds == null && durationSeconds != null) {
        await db.update(jobsTable).set({ durationSeconds }).where(eq(jobsTable.id, existing.id));
      }
    } else {
      const sizeBytes = file.size ? parseInt(file.size, 10) : null;
      const isSuspiciousSize = sizeBytes !== null && sizeBytes > BATCH_RECORDING_SIZE_BYTES;
      const assignment = positionalAssignments.get(file.id) ?? {
        title: await buildYoutubeTitle(file.name ?? "Untitled", file.createdTime ?? null),
        description: await buildYoutubeDescription(file.name ?? "Untitled", file.createdTime ?? null),
      };
      let proposedTitle = assignment.title;
      const proposedDescription = assignment.description;
      if (isSuspiciousSize) {
        proposedTitle = `[REVIEW: large file] ${proposedTitle}`;
      }
      await db.insert(jobsTable).values({
        driveFileId: file.id,
        driveFileName: file.name ?? "Untitled",
        driveFileSizeBytes: sizeBytes,
        driveCreatedTime: file.createdTime ?? null,
        durationSeconds,
        status: "needs_review",
        proposedTitle,
        proposedDescription,
      });
      newJobsCreated++;
    }
  }

  return { newJobsCreated, alreadyQueued, totalScanned, filtered };
}
