import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getGoogleDriveAuthClient } from "./googleAuth";

// Takes a few frames of a Drive recording with ffmpeg and keeps only the name tile of each, enlarged for
// reading. ffmpeg seeks directly in the Drive file over HTTP, so nothing is downloaded in full. The frames
// are written to the folder the caller gives, which the caller removes.

/** Frames taken, evenly spaced inside the recording (20, 40, 60 and 80 percent of its length). */
export const FRAME_COUNT = 4;

// The name tile sits on the right of the frame: the right 28 percent, the middle half of its height,
// enlarged 3 times. Measured in #27 on 93 recordings.
const TILE_FILTER = "crop=iw*0.28:ih*0.5:iw*0.72:ih*0.25,scale=iw*3:-1";

export interface ExtractedFrames {
  /** Paths of the frames that were obtained. */
  paths: string[];
  /** How many of the frames could not be obtained. */
  failed: number;
}

/** Gets the tile frames of one recording into `outDir`. */
export type FrameExtractor = (fileId: string, durationSec: number, outDir: string) => Promise<ExtractedFrames>;

function grabFrame(url: string, token: string, seconds: number, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    // The token travels on ffmpeg's command line (ffmpeg has no other way to take a header), so other
    // processes on this PC can see it while ffmpeg runs. It is short-lived and never logged.
    const p = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-headers", `Authorization: Bearer ${token}\r\n`, "-ss", String(seconds), "-i", url, "-vf", TILE_FILTER, "-frames:v", "1", "-q:v", "3", out],
      { windowsHide: true },
    );
    const timer = setTimeout(() => p.kill(), 120_000);
    p.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && fs.existsSync(out));
    });
  });
}

/** The real extractor: ffmpeg against the Drive file, using the Drive account's short-lived access token. */
export const extractTileFrames: FrameExtractor = async (fileId, durationSec, outDir) => {
  const auth = getGoogleDriveAuthClient();
  if (!auth) throw new Error("Google Drive is not configured");
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("Could not get a Drive access token");
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  const paths: string[] = [];
  let failed = 0;
  for (let k = 1; k <= FRAME_COUNT; k++) {
    const seconds = Math.max(1, Math.round((durationSec * k) / (FRAME_COUNT + 1)));
    const out = path.join(outDir, `frame${k}.jpg`);
    if (await grabFrame(url, token, seconds, out)) paths.push(out);
    else failed++;
  }
  return { paths, failed };
};
