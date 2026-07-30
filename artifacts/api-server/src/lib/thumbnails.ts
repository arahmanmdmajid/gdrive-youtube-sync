import fs from "node:fs";
import path from "node:path";
import { db, lectureNamesTable } from "@workspace/db";

// The server is always started with cwd = artifacts/api-server (see package.json
// scripts and ecosystem.config.cjs), so this resolves reliably in dev and prod.
const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails");
const JOBS_DIR = path.join(THUMBNAILS_DIR, "jobs");

const EXTENSIONS = [".jpg", ".jpeg", ".png"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const SERIAL_RE = /^(\d+\.\d+)/;

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Extracts the leading "N.N" subject serial from a title, or null if absent. */
export function extractSerial(title: string): string | null {
  return title.match(SERIAL_RE)?.[1] ?? null;
}

/** Resolves {dir}/{key}{ext} and rejects any result that escapes dir (e.g. via "../" in key). */
function safeJoin(dir: string, key: string, ext: string): string | null {
  const candidate = path.resolve(dir, `${key}${ext}`);
  const dirWithSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return candidate.startsWith(dirWithSep) ? candidate : null;
}

function findByKey(dir: string, key: string): string | null {
  for (const ext of EXTENSIONS) {
    const candidate = safeJoin(dir, key, ext);
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Looks up an admin-provided thumbnail image for a subject serial.
 * Checks artifacts/api-server/thumbnails/{serial}.{jpg,jpeg,png} in order.
 * Returns the first match, or null if no thumbnail is configured.
 */
export function getSubjectThumbnailPath(serial: string): string | null {
  return findByKey(THUMBNAILS_DIR, serial);
}

/**
 * Looks up a per-video custom thumbnail override, checking
 * artifacts/api-server/thumbnails/jobs/{jobId}.{jpg,jpeg,png}.
 */
export function getJobThumbnailPath(jobId: number): string | null {
  return findByKey(JOBS_DIR, String(jobId));
}

/**
 * Resolves the thumbnail to use for a job: its own custom override first,
 * falling back to the subject default. Used by the bulk apply route so a
 * per-video override survives being re-run.
 */
export function getThumbnailPathForJob(job: { id: number; proposedTitle: string | null }): string | null {
  const jobOverride = getJobThumbnailPath(job.id);
  if (jobOverride) return jobOverride;
  const serial = extractSerial(job.proposedTitle ?? "");
  return serial ? getSubjectThumbnailPath(serial) : null;
}

/**
 * Saves an uploaded image buffer as {dir}/{key}.{ext}, first removing any
 * other-extension variant for the same key so switching formats doesn't
 * leave a stale file that would win by extension-priority order.
 */
export function saveUploadedImage(dir: string, key: string, buffer: Buffer, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) throw new Error(`Unsupported image type: ${mimeType}`);

  ensureDir(dir);
  for (const existingExt of EXTENSIONS) {
    if (existingExt === ext) continue;
    const stale = safeJoin(dir, key, existingExt);
    if (stale && fs.existsSync(stale)) fs.rmSync(stale);
  }

  const dest = safeJoin(dir, key, ext);
  if (!dest) throw new Error(`Invalid key: ${key}`);
  fs.writeFileSync(dest, buffer);
  return dest;
}

export function saveSubjectThumbnail(serial: string, buffer: Buffer, mimeType: string): string {
  return saveUploadedImage(THUMBNAILS_DIR, serial, buffer, mimeType);
}

export function saveJobThumbnail(jobId: number, buffer: Buffer, mimeType: string): string {
  return saveUploadedImage(JOBS_DIR, String(jobId), buffer, mimeType);
}

function deleteByKey(dir: string, key: string): void {
  for (const ext of EXTENSIONS) {
    const candidate = safeJoin(dir, key, ext);
    if (candidate && fs.existsSync(candidate)) fs.rmSync(candidate);
  }
}

export function deleteSubjectThumbnail(serial: string): void {
  deleteByKey(THUMBNAILS_DIR, serial);
}

export function deleteJobThumbnail(jobId: number): void {
  deleteByKey(JOBS_DIR, String(jobId));
}

/**
 * Derives the known subject list for the Settings-tab thumbnail manager from
 * lectureNamesTable — already the admin's authoritative, user-editable
 * subject list, avoiding a third hardcoded serial list alongside
 * schedule.ts's and student-api's subjects.ts.
 */
export async function listKnownSubjectSerials(): Promise<{ serial: string; label: string }[]> {
  const rows = await db.select({ name: lectureNamesTable.name }).from(lectureNamesTable);
  const bySerial = new Map<string, string>();
  for (const { name } of rows) {
    const match = name.match(SERIAL_RE);
    if (!match) continue;
    const serial = match[1]!;
    if (!bySerial.has(serial)) {
      bySerial.set(serial, name.slice(match[0].length).trim());
    }
  }
  return [...bySerial.entries()]
    .map(([serial, label]) => ({ serial, label }))
    .sort((a, b) => a.serial.localeCompare(b.serial, undefined, { numeric: true }));
}
