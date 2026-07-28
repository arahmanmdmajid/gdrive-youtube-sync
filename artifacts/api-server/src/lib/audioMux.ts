import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import { streamDriveFile } from "./driveClient";
import { extractSerial, getSubjectThumbnailPath } from "./thumbnails";
import { logger } from "./logger";

const FALLBACK_COLOR = "0x0f172a";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to launch ffmpeg. Is it installed and on PATH? (${err.message})`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

/**
 * Downloads a Drive audio file and muxes it with a per-subject thumbnail
 * image (or a solid-color fallback frame) into an H.264/AAC mp4, since
 * YouTube's upload API doesn't reliably accept audio-only files.
 *
 * Caller must call the returned cleanup() once the upload attempt is done
 * (success or failure) to remove the temp files.
 */
export async function prepareAudioForYoutube(
  driveFileId: string,
  title: string,
): Promise<{ mp4Path: string; cleanup: () => Promise<void> }> {
  const tmpId = randomUUID();
  const tempAudioPath = path.join(os.tmpdir(), `${tmpId}.mp3`);
  const tempMp4Path = path.join(os.tmpdir(), `${tmpId}.mp4`);

  const cleanup = async () => {
    await Promise.all([
      rm(tempAudioPath, { force: true }),
      rm(tempMp4Path, { force: true }),
    ]);
  };

  try {
    const driveStream = await streamDriveFile(driveFileId);
    await pipeline(driveStream, fs.createWriteStream(tempAudioPath));

    const serial = extractSerial(title);
    const thumbPath = serial ? getSubjectThumbnailPath(serial) : null;

    const imageArgs = thumbPath
      ? ["-loop", "1", "-i", thumbPath]
      : ["-f", "lavfi", "-i", `color=c=${FALLBACK_COLOR}:s=1280x720`];

    if (!thumbPath) {
      logger.info({ driveFileId, title, serial }, "No subject thumbnail configured — using solid-color fallback frame");
    }

    const args = [
      "-y",
      ...imageArgs,
      "-i", tempAudioPath,
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-shortest",
      tempMp4Path,
    ];

    await runFfmpeg(args);

    return { mp4Path: tempMp4Path, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
