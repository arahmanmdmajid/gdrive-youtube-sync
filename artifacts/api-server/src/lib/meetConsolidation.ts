import fs from "node:fs";
import path from "node:path";
import { db, driveMoveLogTable, driveSourceFoldersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient, listChildren, listTopLevelMeetFolders, FOLDER_MIME_TYPE } from "./driveClient";
import { logger } from "./logger";

type Drive = NonNullable<ReturnType<typeof getDriveClient>>;

// Meet names each session folder "<meeting-code> - YYYY/MM/DD HH:mm PKT". The merged
// folder drops the time: "<meeting-code> - YYYY/MM/DD".
const SESSION_RE = /^(.+?) - (\d{4}\/\d{2}\/\d{2}) \d{2}:\d{2} PKT$/;
const MERGED_RE = /^.+ - \d{4}\/\d{2}\/\d{2}$/;

interface Session { id: string; code: string; date: string; parent: string }

export interface ConsolidationSummary {
  dryRun: boolean;
  groups: number;
  created: number;
  renamed: number;
  moved: number;
  skippedToday: number;
  failed: number;
}

const pktDate = (ms: number) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "/");

// Every move is appended here (file, old parent, new parent) so a bad run can be reversed by
// swapping the two parents. Lives next to the process, not in git.
const MOVE_LOG = process.env.MEET_MOVE_LOG ?? path.join(process.cwd(), "meet-moves.jsonl");

type MoveEntry = { kind: "move" | "rename" | "trash"; fileId: string; fromId?: string; toId?: string };

// Also kept in the database, because a scheduled job has no disk that outlives the run. For a
// rename, toId holds the new name.
async function logMove(e: MoveEntry): Promise<void> {
  fs.appendFileSync(MOVE_LOG, JSON.stringify(e) + "\n");
  await db.insert(driveMoveLogTable).values(e);
}

/**
 * Gathers Meet's per-session folders from every top-level "Google Meet" folder into one
 * "<code> - YYYY/MM/DD" folder per code and day, under `targetFolderId` (one already-shared
 * folder, so everyone has a single link).
 *
 * Moves every item in a session folder (videos, Gemini notes, transcripts) so nothing is
 * left behind; file IDs don't change, so jobs keyed by driveFileId are unaffected. Never
 * deletes: emptied session folders are left for a human. Sessions on today's PKT date are
 * skipped, since Meet may still be writing to them; everything earlier is merged, so each
 * day's sessions are merged the following morning. Safe to re-run: a day already merged is a
 * no-op, and a failed move is simply retried next run.
 */
export async function consolidateMeetFolders(
  drive: Drive,
  opts: { targetFolderId: string; apply: boolean; lookbackDays?: number },
): Promise<ConsolidationSummary> {
  const { targetFolderId, apply } = opts;
  const summary: ConsolidationSummary = { dryRun: !apply, groups: 0, created: 0, renamed: 0, moved: 0, skippedToday: 0, failed: 0 };

  const sessions: Session[] = [];
  for (const { id: parent } of await listTopLevelMeetFolders(drive)) {
    for (const f of await listChildren(drive, parent, `mimeType = '${FOLDER_MIME_TYPE}'`)) {
      const m = f.name.match(SESSION_RE);
      if (m) sessions.push({ id: f.id, code: m[1]!, date: m[2]!, parent });
    }
  }

  const today = pktDate(Date.now());
  // ponytail: a bounded lookback keeps the daily run small as emptied folders pile up; pass
  // none (manual "all") to sweep the whole backlog.
  const since = opts.lookbackDays ? pktDate(Date.now() - opts.lookbackDays * 86400e3) : "";
  summary.skippedToday = sessions.filter((s) => s.date === today).length;

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.date === today || s.date < since) continue;
    const key = `${s.code} - ${s.date}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const merged = new Map<string, string>();
  for (const f of await listChildren(drive, targetFolderId, `mimeType = '${FOLDER_MIME_TYPE}'`)) {
    if (MERGED_RE.test(f.name)) merged.set(f.name, f.id);
  }

  for (const [name, group] of [...groups].sort()) {
    try {
      let dest = merged.get(name);
      // A session already sitting in the target is renamed in place instead of being emptied
      // into a new folder next to it.
      const rename = dest ? undefined : group.find((s) => s.parent === targetFolderId);
      const sources = group.filter((s) => s.id !== rename?.id);

      const batches: { from: string; items: string[] }[] = [];
      for (const s of sources) {
        const items = (await listChildren(drive, s.id)).map((i) => i.id);
        if (items.length) batches.push({ from: s.id, items });
      }
      if (!rename && batches.length === 0) continue; // nothing to rename or move, so not counted as a group
      summary.groups++;

      if (!apply) {
        logger.info({ name, rename: !!rename, create: !dest && !rename, items: batches.flatMap((b) => b.items).length }, "Meet consolidation (dry run)");
        continue;
      }

      if (rename) {
        await drive.files.update({ fileId: rename.id, requestBody: { name }, supportsAllDrives: true, fields: "id" });
        dest = rename.id;
        summary.renamed++;
        await logMove({ kind: "rename", fileId: rename.id, toId: name });
      } else if (!dest) {
        dest = (await drive.files.create({
          requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [targetFolderId] },
          supportsAllDrives: true,
          fields: "id",
        })).data.id!;
        summary.created++;
      }
      merged.set(name, dest);

      for (const b of batches) {
        for (const fileId of b.items) {
          await drive.files.update({ fileId, addParents: dest, removeParents: b.from, supportsAllDrives: true, fields: "id" });
          await logMove({ kind: "move", fileId, fromId: b.from, toId: dest });
          summary.moved++;
        }
      }
    } catch (err) {
      // One bad group must not stop the rest; it is retried on the next run.
      summary.failed++;
      logger.warn({ name, err }, "Meet consolidation: group failed");
    }
  }

  logger.info({ ...summary, targetFolderId }, "Meet consolidation summary");
  return summary;
}

export interface CleanupSummary { dryRun: boolean; eligible: number; trashed: number; unregistered: number; emptySessions: number; sessionsTrashed: number; failed: number }

/**
 * Moves to the Drive TRASH (recoverable for ~30 days, never a permanent delete) the top-level
 * "Google Meet" folders that consolidation has left holding nothing but empty session folders,
 * and drops their registration in the app so the scan stops listing them. Empty session folders
 * that are left in a folder that stays (the newest one, or one holding anything else) are
 * trashed on their own.
 *
 * A top-level folder is only eligible when EVERY child is a session folder with no items in
 * it, so the legacy "Meet Recordings" archive and anything unexpected keep their parent alive.
 * Never touched: the target, the top-level folders themselves when newest, any non-empty
 * session, and any session on today's PKT date, because an empty session folder there may be
 * a recording still being processed.
 */
export async function cleanupEmptyMeetFolders(
  drive: Drive,
  opts: { targetFolderId: string; apply: boolean },
): Promise<CleanupSummary> {
  const summary: CleanupSummary = { dryRun: !opts.apply, eligible: 0, trashed: 0, unregistered: 0, emptySessions: 0, sessionsTrashed: 0, failed: 0 };
  const all = await listTopLevelMeetFolders(drive);
  const tops = all.filter((f) => f.id !== opts.targetFolderId);
  if (tops.length === 0) return summary;
  const newest = tops.reduce((a, f) => (f.createdTime > a.createdTime ? f : a)).id;

  // Same freshness rule as consolidation: sessions dated today may still be in progress.
  const today = pktDate(Date.now());

  for (const { id } of tops) {
    try {
      const kids = await listChildren(drive, id);
      const empties: typeof kids = [];
      for (const k of kids) {
        const m = k.name.match(SESSION_RE);
        if (k.mimeType === FOLDER_MIME_TYPE && m && m[2] !== today && (await listChildren(drive, k.id)).length === 0) empties.push(k);
      }
      if (empties.length === 0) continue;

      // Everything inside is an empty session: the whole folder goes, unless it is the newest
      // (Meet's likely active one) or the only one.
      if (empties.length === kids.length && id !== newest && tops.length > 1) {
        summary.eligible++;
        if (!opts.apply) {
          logger.info({ folderId: id, sessions: kids.length }, "Meet cleanup (dry run): would trash");
          continue;
        }
        await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true, fields: "id" });
        await logMove({ kind: "trash", fileId: id });
        summary.trashed++;
        const removed = await db.delete(driveSourceFoldersTable).where(eq(driveSourceFoldersTable.folderId, id)).returning();
        summary.unregistered += removed.length;
        continue;
      }

      // Otherwise trash just the empty sessions and leave the folder itself.
      for (const s of empties) {
        summary.emptySessions++;
        if (!opts.apply) {
          logger.info({ folderId: s.id, name: s.name }, "Meet cleanup (dry run): would trash empty session");
          continue;
        }
        // Look again right before trashing: a late file may have landed since the first check.
        if ((await listChildren(drive, s.id)).length > 0) continue;
        await drive.files.update({ fileId: s.id, requestBody: { trashed: true }, supportsAllDrives: true, fields: "id" });
        await logMove({ kind: "trash", fileId: s.id });
        summary.sessionsTrashed++;
      }
    } catch (err) {
      summary.failed++; // retried on the next run
      logger.warn({ folderId: id, err }, "Meet cleanup: folder failed");
    }
  }
  logger.info(summary, "Meet cleanup summary");
  return summary;
}

let lastRunDay = "";

/** Runs once per PKT day, from 06:00, so the previous day's recordings are finished processing. */
export async function maybeRunDailyConsolidation(): Promise<void> {
  const target = process.env.DRIVE_CONSOLIDATE_TARGET_FOLDER_ID;
  if (!target) return;
  const pktNow = new Date(Date.now() + 5 * 3600e3);
  const day = pktDate(Date.now());
  if (pktNow.getUTCHours() < 6 || lastRunDay === day) return;
  const drive = getDriveClient();
  if (!drive) return;
  lastRunDay = day; // set first: a failure is retried tomorrow rather than every minute
  await runMeetMerge(drive, target);
}

/** One daily pass: merge, then cleanup. Shared by the worker and the scheduled script. */
export async function runMeetMerge(drive: Drive, targetFolderId: string) {
  const consolidation = await consolidateMeetFolders(drive, {
    targetFolderId,
    apply: process.env.DRIVE_CONSOLIDATE_APPLY === "true",
    lookbackDays: 14,
  });
  // Cleanup has its own flag so it can be dry-run (and trusted) independently of the moves.
  const cleanup = await cleanupEmptyMeetFolders(drive, { targetFolderId, apply: process.env.DRIVE_CLEANUP_APPLY === "true" });
  return { consolidation, cleanup };
}
