import type { Readable } from "node:stream";
import { logger } from "./logger";
import type { getYoutubeClient } from "./youtubeClient";
import {
  findVideoOnYoutube,
  isTransient,
  INCOMPLETE_UPLOAD_GRACE_MS,
  type YoutubeMatch,
} from "./youtubeMatch";

type Youtube = NonNullable<ReturnType<typeof getYoutubeClient>>;

// ── What to do about a video that may already be on YouTube ─────────────────

export type UploadDecision = "upload" | "adopt" | "wait";

/**
 * Decides, from what the channel already holds under this title, whether to upload.
 * - nothing there: upload.
 * - a complete video: adopt it, do not upload a second copy.
 * - an incomplete one younger than the grace period: it may be this very job's earlier upload
 *   still processing. Wait: uploading now would make a duplicate.
 * - an incomplete one older than that: a dead husk from an interrupted upload, which never
 *   finishes. Upload again; the husk stays on YouTube for manual deletion.
 */
export function decideBeforeUpload(match: YoutubeMatch | null, nowMs: number = Date.now()): UploadDecision {
  if (!match) return "upload";
  if (match.complete) return "adopt";
  const ageMs = match.publishedAt ? nowMs - Date.parse(match.publishedAt) : Infinity;
  return ageMs < INCOMPLETE_UPLOAD_GRACE_MS ? "wait" : "upload";
}

// ── Recording a finished upload, even if the database is briefly unavailable ─

/** Marks the job done for this video. The real one updates the jobs table. */
export type WriteDone = (jobId: number, videoId: string, title: string) => Promise<void>;

/** The video is on YouTube but the database would not record it. The job must stay recoverable. */
export class UploadNotRecordedError extends Error {
  constructor(readonly jobId: number, readonly videoId: string, readonly cause: unknown) {
    super(`Uploaded to YouTube as ${videoId} but the database write failed`);
    this.name = "UploadNotRecordedError";
  }
}

// Uploads YouTube accepted but we could not record, by job. Kept in memory so the video ID (certain)
// is used to finish the job later instead of guessing from the title. If the process dies first,
// startup recovery matches by title as before.
const unrecorded = new Map<number, { videoId: string; title: string }>();
export const unrecordedJobIds = (): number[] => [...unrecorded.keys()];

// Jobs this process is uploading right now, so the stranded-job sweep never touches them.
const active = new Set<number>();
export const markUploadActive = (jobId: number) => void active.add(jobId);
export const markUploadInactive = (jobId: number) => void active.delete(jobId);
export const activeUploadJobIds = (): number[] => [...active];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Writes "done" with a few retries. If it still fails, remembers the video ID and throws
 * UploadNotRecordedError, which the caller must treat as "uploaded, not failed".
 */
export async function recordDone(
  jobId: number,
  videoId: string,
  title: string,
  write: WriteDone,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      await write(jobId, videoId, title);
      unrecorded.delete(jobId);
      return;
    } catch (err) {
      last = err;
      if (i < attempts) await sleep(baseDelayMs * 2 ** (i - 1));
    }
  }
  unrecorded.set(jobId, { videoId, title });
  logger.error(
    { jobId, videoId, title, err: last },
    "UPLOADED TO YOUTUBE BUT NOT RECORDED: the job stays processing and will be finished from this video ID",
  );
  throw new UploadNotRecordedError(jobId, videoId, last);
}

/** Tries again to record every upload that was accepted but not recorded. Returns the jobs finished. */
export async function retryUnrecorded(write: WriteDone): Promise<{ jobId: number; videoId: string; title: string }[]> {
  const finished: { jobId: number; videoId: string; title: string }[] = [];
  for (const [jobId, { videoId, title }] of [...unrecorded]) {
    try {
      await write(jobId, videoId, title);
      unrecorded.delete(jobId);
      finished.push({ jobId, videoId, title });
      logger.info({ jobId, videoId }, "Recorded an upload that could not be saved earlier");
    } catch (err) {
      logger.warn({ jobId, videoId, err }, "Still cannot record the upload, will try again");
    }
  }
  return finished;
}

// ── The upload itself ───────────────────────────────────────────────────────

export interface UploadDeps {
  youtube: Youtube;
  /** Opens the file to send. Called again if the insert is retried. */
  openStream: () => Promise<NodeJS.ReadableStream | Readable>;
  write: WriteDone;
  /** Looks for an existing upload by title. Must throw if it cannot look. */
  find?: typeof findVideoOnYoutube;
  now?: () => number;
  recordOpts?: { attempts?: number; baseDelayMs?: number };
  insertAttempts?: number;
  insertRetryDelayMs?: number;
}

export type UploadOutcome =
  | { kind: "uploaded"; videoId: string }
  | { kind: "adopted"; videoId: string }
  | { kind: "waiting"; videoId: string };

/**
 * Looks on YouTube first, every time, then adopts, waits or uploads (decideBeforeUpload).
 * - A lookup that fails throws before anything is sent, so a failed lookup can never cause an upload.
 * - After the upload the video is recorded with retries. If the database will not take it, this
 *   throws UploadNotRecordedError and the job is finished later by video ID, not re-uploaded.
 */
export async function performUpload(
  job: { id: number; title: string; description: string },
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const find = deps.find ?? findVideoOnYoutube;

  // Looks at what the channel holds and, if a video is already there (complete, or still processing),
  // settles the job without uploading. Returns null when an upload is the right thing to do.
  const settleExisting = async (): Promise<UploadOutcome | null> => {
    const match = await find(deps.youtube, job.title);
    const decision = decideBeforeUpload(match, deps.now?.());
    if (decision === "adopt" && match) {
      logger.info({ jobId: job.id, videoId: match.videoId }, "Video already on YouTube, adopting it instead of uploading again");
      await recordDone(job.id, match.videoId, job.title, deps.write, deps.recordOpts);
      return { kind: "adopted", videoId: match.videoId };
    }
    if (decision === "wait" && match) {
      logger.warn(
        { jobId: job.id, videoId: match.videoId },
        "A same-titled upload is still processing on YouTube, not uploading again for now",
      );
      return { kind: "waiting", videoId: match.videoId };
    }
    if (match && !match.complete) {
      logger.warn({ jobId: job.id, videoId: match.videoId }, "Found a same-titled but dead incomplete upload, ignoring it and uploading again");
    }
    return null;
  };

  const already = await settleExisting();
  if (already) return already;

  // A network error can hit after YouTube already received the file, so a plain retry of the insert
  // could create a second video. Look again before every retry instead of resending blindly.
  const maxAttempts = deps.insertAttempts ?? 3;
  let response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await deps.youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: { title: job.title, description: job.description },
          status: { privacyStatus: "unlisted" },
        },
        media: { mimeType: "video/mp4", body: await deps.openStream() },
      });
      break;
    } catch (err) {
      if (!isTransient(err) || attempt >= maxAttempts) throw err;
      logger.warn({ jobId: job.id, attempt, err }, "Transient error during upload, checking YouTube before retrying");
      await sleep((deps.insertRetryDelayMs ?? 2000) * 2 ** (attempt - 1));
      const settled = await settleExisting();
      if (settled) return settled;
    }
  }
  const videoId = response.data.id;
  if (!videoId) throw new Error("YouTube accepted the upload but returned no video id");

  await recordDone(job.id, videoId, job.title, deps.write, deps.recordOpts);
  return { kind: "uploaded", videoId };
}
