import { Router, type Request, type Response } from "express";
import { db, jobsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getDriveClient } from "../lib/driveClient";
import { logger } from "../lib/logger";

const router: Router = Router();

/** Parses a "bytes=start-end" Range header against a known total size. Returns null if absent/invalid. */
function parseRange(rangeHeader: string | undefined, totalSize: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startStr, endStr] = match;
  const start = startStr ? parseInt(startStr, 10) : 0;
  const end = endStr ? Math.min(parseInt(endStr, 10), totalSize - 1) : totalSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) return null;
  return { start, end };
}

// Deliberately not behind requireAuth — mirrors how video lectures already
// work: the app gates *discovering* a lecture's driveFileId behind login
// (via /student/subjects), but the resource itself, like an unlisted
// YouTube video, has no further per-request auth check. driveFileId is
// Drive's own long random ID, not a guessable sequential value, so this
// isn't a meaningful weakening — and it lets a plain <audio src> element
// play the file without needing to attach a bearer token.
//
// Streams the file through our own service-account Drive credentials
// rather than embedding Drive's own player: Drive's audio preview iframe
// requires an authenticated Google session cookie that third-party cookie
// partitioning (e.g. Firefox's Total Cookie Protection) blocks, breaking
// playback even for "anyone with link" files. A proxied <audio> element
// has no such dependency.
router.get("/audio-stream/:driveFileId", async (req: Request, res: Response) => {
  const driveFileId = req.params.driveFileId as string;

  const [job] = await db
    .select({ id: jobsTable.id, sizeBytes: jobsTable.driveFileSizeBytes })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.driveFileId, driveFileId),
        eq(jobsTable.status, "done"),
        eq(jobsTable.contentType, "audio"),
      ),
    )
    .limit(1);
  if (!job) {
    res.status(404).end();
    return;
  }

  const drive = getDriveClient();
  if (!drive) {
    res.status(503).json({ error: "Drive not configured" });
    return;
  }

  try {
    // Drive's streamed response doesn't reliably include content-length/content-range,
    // which browsers' <audio> decoders need up front (Chrome tolerates the omission,
    // Firefox rejects the stream as a format error without it) — compute them ourselves
    // from the file size already recorded at scan time, rather than trusting Drive's headers.
    const totalSize = job.sizeBytes;
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;
    const range = totalSize ? parseRange(rangeHeader, totalSize) : null;

    const driveRes = await drive.files.get(
      { fileId: driveFileId, alt: "media" },
      { responseType: "stream", headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined },
    );

    res.setHeader("Content-Type", driveRes.headers["content-type"] ?? "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    if (range && totalSize) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
      res.setHeader("Content-Length", String(range.end - range.start + 1));
    } else {
      res.status(200);
      if (totalSize) res.setHeader("Content-Length", String(totalSize));
    }

    (driveRes.data as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    logger.error({ err, driveFileId }, "Failed to stream audio file");
    if (!res.headersSent) res.status(502).json({ error: "Failed to stream audio" });
  }
});

export default router;
