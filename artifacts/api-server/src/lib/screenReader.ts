import { subjectFromFrames } from "./screenSubject";
import { FRAME_COUNT, type FrameExtractor } from "./tileFrames";
import { defaultMakeTempDir, defaultRemoveDir, safeMessage } from "./teacherReader";
import type { OcrLines } from "./windowsOcr";

// Reads which book is open on the shared screen in one recording, from the file name in the PDF viewer's
// toolbar. The frames are whole screens (they show people and their personal tabs), so they live in a
// temporary folder that is always removed, and the recognized lines live in memory only: they go to the
// parser and are dropped. Only the verdict leaves this function.

export interface ScreenReadResult {
  status: "ok" | "failed";
  subject: string | null;
  serials: string[];
  ambiguous: boolean;
  framesTotal: number;
  framesRead: number;
  framesMatched: number;
  /** Why a read failed. Short, and never recognized text. */
  error: string | null;
}

export interface ScreenReaderDeps {
  extract: FrameExtractor;
  ocr: OcrLines;
  /** For tests: where the temporary folder is made and removed. */
  makeTempDir?: () => Promise<string>;
  removeDir?: (dir: string) => Promise<void>;
}

const failed = (error: string, framesRead = 0): ScreenReadResult => ({
  status: "failed",
  subject: null,
  serials: [],
  ambiguous: false,
  framesTotal: FRAME_COUNT,
  framesRead,
  framesMatched: 0,
  error,
});

export async function readRecordingScreen(
  job: { driveFileId: string; durationSeconds: number | null },
  deps: ScreenReaderDeps,
): Promise<ScreenReadResult> {
  if (job.durationSeconds == null || job.durationSeconds <= 0) return failed("the recording has no length yet");

  const dir = await (deps.makeTempDir ?? defaultMakeTempDir)();
  try {
    const frames = await deps.extract(job.driveFileId, job.durationSeconds, dir);
    if (frames.paths.length === 0) return failed("no frame could be read from Drive");

    const reading = subjectFromFrames(await deps.ocr(frames.paths));
    return {
      status: "ok",
      subject: reading.subject,
      serials: reading.serials,
      ambiguous: reading.ambiguous,
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
