import fs from "node:fs";
import path from "node:path";
import { getDriveClient, listChildren, FOLDER_MIME_TYPE } from "./driveClient";
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
  skippedLatest: number;
  failed: number;
}

const pktDate = (ms: number) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "/");

// Every move is appended here (file, old parent, new parent) so a bad run can be reversed by
// swapping the two parents. Lives next to the process, not in git.
const MOVE_LOG = process.env.MEET_MOVE_LOG ?? path.join(process.cwd(), "meet-moves.jsonl");

async function listTopLevelMeetFolders(drive: Drive): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `name = 'Google Meet' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "nextPageToken, files(id)",
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...(res.data.files ?? []).map((f) => f.id!).filter(Boolean));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

/**
 * Gathers Meet's per-session folders from every top-level "Google Meet" folder into one
 * "<code> - YYYY/MM/DD" folder per code and day, under `targetFolderId` (one already-shared
 * folder, so everyone has a single link).
 *
 * Moves every item in a session folder (videos, Gemini notes, transcripts) so nothing is
 * left behind; file IDs don't change, so jobs keyed by driveFileId are unaffected. Never
 * deletes: emptied session folders are left for a human. Sessions on today's PKT date and on
 * the newest date in Drive are skipped, since Meet may still be writing to them. Safe to
 * re-run: a day already merged is a no-op, and a failed move is simply retried next run.
 */
export async function consolidateMeetFolders(
  drive: Drive,
  opts: { targetFolderId: string; apply: boolean; lookbackDays?: number },
): Promise<ConsolidationSummary> {
  const { targetFolderId, apply } = opts;
  const summary: ConsolidationSummary = { dryRun: !apply, groups: 0, created: 0, renamed: 0, moved: 0, skippedLatest: 0, failed: 0 };

  const sessions: Session[] = [];
  for (const parent of await listTopLevelMeetFolders(drive)) {
    for (const f of await listChildren(drive, parent, `mimeType = '${FOLDER_MIME_TYPE}'`)) {
      const m = f.name.match(SESSION_RE);
      if (m) sessions.push({ id: f.id, code: m[1]!, date: m[2]!, parent });
    }
  }

  const today = pktDate(Date.now());
  const latest = sessions.reduce((a, s) => (s.date > a ? s.date : a), "");
  // ponytail: a bounded lookback keeps the daily run small as emptied folders pile up; pass
  // none (manual "all") to sweep the whole backlog.
  const since = opts.lookbackDays ? pktDate(Date.now() - opts.lookbackDays * 86400e3) : "";
  summary.skippedLatest = sessions.filter((s) => s.date === today || s.date === latest).length;

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.date === today || s.date === latest || s.date < since) continue;
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
      if (!rename && !dest && batches.length === 0) continue; // nothing to gather
      summary.groups++;

      if (!apply) {
        logger.info({ name, rename: !!rename, create: !dest && !rename, items: batches.flatMap((b) => b.items).length }, "Meet consolidation (dry run)");
        continue;
      }

      if (rename) {
        await drive.files.update({ fileId: rename.id, requestBody: { name }, supportsAllDrives: true, fields: "id" });
        dest = rename.id;
        summary.renamed++;
        fs.appendFileSync(MOVE_LOG, JSON.stringify({ rename: rename.id, to: name }) + "\n");
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
          fs.appendFileSync(MOVE_LOG, JSON.stringify({ fileId, from: b.from, to: dest }) + "\n");
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
  await consolidateMeetFolders(drive, {
    targetFolderId: target,
    apply: process.env.DRIVE_CONSOLIDATE_APPLY === "true",
    lookbackDays: 14,
  });
}
