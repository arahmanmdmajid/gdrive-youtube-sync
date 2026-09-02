import { db, jobsTable, settingsTable, lectureNamesTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { getDriveClient, listChildren, FOLDER_MIME_TYPE, type DriveChildFile } from "./driveClient";
import { logger } from "./logger";

// Within the "2.0" group, the Recordings folder's own numbering is swapped
// relative to the correct lecture serials: its "2.2" subfolder is Khair ul
// Usool (correct serial 2.4, added to lectureNamesTable 2026-07-28 — no
// video-lecture slot exists for it yet) and its "2.4" is Kitab ul Asaar
// (correct serial 2.2, matches the existing video-lecture subject). Every
// other subfolder's own numbering already matches the correct serial.
const SERIAL_SWAP: Record<string, string> = {
  "2.2": "2.4",
  "2.4": "2.2",
};

const SERIAL_RE = /^(\d+\.\d+)/;
const DATE_RE = /(\d{2})(\d{2})(\d{4})\.mp3$/i;

function extractSwappedSerial(...names: (string | undefined)[]): string | null {
  for (const name of names) {
    const match = name?.match(SERIAL_RE);
    if (match) return SERIAL_SWAP[match[1]!] ?? match[1]!;
  }
  return null;
}

/** Parses the trailing DDMMYYYY suffix into { dateStr: "DD-MM-YYYY", isoDate }, or null if absent. */
function extractDate(fileName: string): { dateStr: string; isoDate: string } | null {
  const match = fileName.match(DATE_RE);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // Noon UTC on the parsed PKT calendar day — round-trips correctly through
  // the existing +5h PKT-offset date formatting used elsewhere (routes/jobs.ts).
  const isoDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
  return { dateStr: `${dd}-${mm}-${yyyy}`, isoDate };
}

function cleanFileName(fileName: string): string {
  return fileName.replace(/\.mp3$/i, "").trim();
}

async function processFile(
  file: DriveChildFile,
  parentFolderName: string | undefined,
  counts: { matched: number; unmatched: number },
): Promise<string | null> {
  const [existing] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(eq(jobsTable.driveFileId, file.id))
    .limit(1);
  if (existing) return null;

  const serial = extractSwappedSerial(file.name, parentFolderName);
  const date = extractDate(file.name);

  let proposedTitle: string;
  if (serial && date) {
    const [lectureName] = await db
      .select({ name: lectureNamesTable.name })
      .from(lectureNamesTable)
      .where(like(lectureNamesTable.name, `${serial} %`))
      .limit(1);
    if (lectureName) {
      proposedTitle = `${lectureName.name} | ${date.dateStr}`;
      counts.matched++;
    } else {
      proposedTitle = cleanFileName(file.name);
      counts.unmatched++;
    }
  } else {
    proposedTitle = cleanFileName(file.name);
    counts.unmatched++;
  }

  await db.insert(jobsTable).values({
    driveFileId: file.id,
    driveFileName: file.name,
    driveFileSizeBytes: file.size ? Number(file.size) : null,
    driveCreatedTime: date?.isoDate ?? null,
    status: "needs_review",
    source: "pipeline",
    contentType: "audio",
    proposedTitle,
  });
  return file.id;
}

export async function scanAudioLibrary(): Promise<{
  scanned: number;
  inserted: number;
  skipped: number;
  matched: number;
  unmatched: number;
}> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.audioFolderId) {
    throw new Error("Audio folder is not configured — set it in Settings first.");
  }

  const drive = getDriveClient();
  if (!drive) {
    throw new Error("Google Drive not configured. Please add OAuth credentials.");
  }

  let scanned = 0;
  let inserted = 0;
  let skipped = 0;
  const counts = { matched: 0, unmatched: 0 };

  async function runFiles(files: DriveChildFile[], parentFolderName: string | undefined) {
    for (const file of files) {
      scanned++;
      const insertedId = await processFile(file, parentFolderName, counts);
      if (insertedId) inserted++;
      else skipped++;
    }
  }

  // Loose files can sit directly under the Recordings root, as siblings of
  // the "N.0 GroupName" folders — not just nested inside them.
  const rootChildren = await listChildren(drive, settings.audioFolderId);
  const groupFolders = rootChildren.filter((c) => c.mimeType === FOLDER_MIME_TYPE);
  const rootLooseFiles = rootChildren.filter((c) => c.mimeType === "audio/mpeg");
  await runFiles(rootLooseFiles, undefined);

  for (const group of groupFolders) {
    const children = await listChildren(drive, group.id);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME_TYPE) {
        const files = await listChildren(drive, child.id, "mimeType = 'audio/mpeg'");
        await runFiles(files, child.name);
      } else if (child.mimeType === "audio/mpeg") {
        await runFiles([child], group.name);
      }
    }
  }

  logger.info({ scanned, inserted, skipped, ...counts }, "Audio library scan complete");
  return { scanned, inserted, skipped, matched: counts.matched, unmatched: counts.unmatched };
}
