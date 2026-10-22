import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readTeacher, type AliasEntry } from "./teacherTile";
import type { FrameExtractor } from "./tileFrames";
import { FRAME_COUNT } from "./tileFrames";
import type { Ocr } from "./windowsOcr";

// Reads which teacher is on screen in one recording. The frames live in a temporary folder that is
// always removed, and the recognized text lives in memory only: it goes to the matcher and is dropped.
// Only the verdict leaves this function, and nothing it logs or stores contains frames or text.

export interface ReadResult {
  status: "ok" | "failed";
  teacher: string | null;
  ambiguous: boolean;
  matched: string[];
  framesTotal: number;
  framesRead: number;
  framesMatched: number;
  /** Why a read failed. Short, and never recognized text. */
  error: string | null;
}

export interface ReaderDeps {
  extract: FrameExtractor;
  ocr: Ocr;
  aliases: AliasEntry[];
  /** For tests: where the temporary folder is made and removed. */
  makeTempDir?: () => Promise<string>;
  removeDir?: (dir: string) => Promise<void>;
}

const failed = (error: string, framesRead = 0): ReadResult => ({
  status: "failed",
  teacher: null,
  ambiguous: false,
  matched: [],
  framesTotal: FRAME_COUNT,
  framesRead,
  framesMatched: 0,
  error,
});

/** Prefix of the temporary folders that hold a recording's frames while it is being read. */
export const TILE_DIR_PREFIX = "dtt-tile-";

const defaultMakeTempDir = () => fs.mkdtemp(path.join(os.tmpdir(), TILE_DIR_PREFIX));

/**
 * Removes frame folders left behind when a read was cut short (the process was killed or crashed, so the
 * `finally` never ran). Only folders with the reader's prefix that have not been touched for a while, so a
 * read in progress is never disturbed. Returns how many were removed. Frames are real participants' faces:
 * they must not be left on disk.
 */
export async function sweepTileFolders(opts: { baseDir?: string; olderThanMs?: number; now?: number } = {}): Promise<number> {
  const base = opts.baseDir ?? os.tmpdir();
  const olderThanMs = opts.olderThanMs ?? 10 * 60 * 1000;
  const now = opts.now ?? Date.now();
  let removed = 0;
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(TILE_DIR_PREFIX)) continue;
    const dir = path.join(base, entry.name);
    try {
      const { mtimeMs } = await fs.stat(dir);
      if (now - mtimeMs < olderThanMs) continue;
      await fs.rm(dir, { recursive: true, force: true });
      removed++;
    } catch {
      /* in use or already gone: leave it, it is tried again next time */
    }
  }
  return removed;
}
const defaultRemoveDir = (dir: string) => fs.rm(dir, { recursive: true, force: true });

/** An error message that is safe to store: our own wording or a short cut of an error, never frame text. */
function safeMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.replace(/\s+/g, " ").slice(0, 150);
}

export async function readRecordingTeacher(
  job: { driveFileId: string; durationSeconds: number | null },
  deps: ReaderDeps,
): Promise<ReadResult> {
  if (job.durationSeconds == null || job.durationSeconds <= 0) return failed("the recording has no length yet");
  if (deps.aliases.length === 0) return failed("the alias table is empty");

  const dir = await (deps.makeTempDir ?? defaultMakeTempDir)();
  try {
    const frames = await deps.extract(job.driveFileId, job.durationSeconds, dir);
    if (frames.paths.length === 0) return failed("no frame could be read from Drive");

    const texts = await deps.ocr(frames.paths);
    const reading = readTeacher(texts, deps.aliases);
    return {
      status: "ok",
      teacher: reading.teacher,
      ambiguous: reading.ambiguous,
      matched: reading.matched,
      framesTotal: FRAME_COUNT,
      framesRead: frames.paths.length,
      framesMatched: reading.framesMatched,
      error: null,
    };
  } catch (err) {
    return failed(safeMessage(err));
  } finally {
    await (deps.removeDir ?? defaultRemoveDir)(dir).catch(() => undefined);
  }
}
