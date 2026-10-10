import { getYoutubeClient } from "./youtubeClient";
import { logger } from "./logger";

/** Returns true for errors that are worth retrying (DNS blip, socket reset, timeout). */
export function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|network/i.test(msg);
}

/** Returns true if the error message looks like an OAuth / token failure. */
export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /token|oauth|auth|getaddrinfo/i.test(msg);
}

/** Returns true if the error is a YouTube quota exceeded error. */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota exceeded|quotaExceeded|rateLimitExceeded|exceeded your.*quota|exceeded.*quota/i.test(msg);
}

/**
 * Returns true if the error is YouTube's per-account thumbnail-upload rate
 * limit ("too many thumbnails recently") — separate from the daily upload
 * quota, undocumented reset window, worth its own detection so bulk
 * thumbnail application can stop cleanly instead of failing every
 * remaining job in the batch.
 */
export function isThumbnailRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /too many thumbnails/i.test(msg);
}

/**
 * Thrown by uploadJob when YouTube's daily upload quota is hit.
 * processAllPendingJobs catches this to stop the batch immediately.
 */
export class QuotaExceededError extends Error {
  constructor() {
    super("YouTube daily upload quota exceeded — remaining jobs left as pending for tomorrow");
    this.name = "QuotaExceededError";
  }
}

/** A title match on the channel, plus whether that upload actually completed. */
export interface YoutubeMatch {
  videoId: string;
  /**
   * True once YouTube holds the whole file. An upload killed mid-stream still
   * leaves a video resource behind — the resource is created when the upload
   * starts, not when it finishes — and that husk sits at uploaded/processing
   * with duration "P0D" forever, showing "processing will begin shortly" in
   * Studio. Adopting one of those marks a job done against a video that will
   * never play, so every caller must check this before trusting the match.
   */
  complete: boolean;
  /** Publish time, used to tell a still-transcoding upload from a dead husk. */
  publishedAt: string | null;
}

/**
 * Search the authenticated YouTube channel for a video whose title exactly
 * matches `title`. Returns the match if found, null otherwise.
 * Uses the cheap videos.list on the channel's uploads playlist — avoids
 * the expensive search.list quota cost.
 */
export async function findVideoOnYoutube(
  youtube: ReturnType<typeof getYoutubeClient>,
  title: string,
): Promise<YoutubeMatch | null> {
  if (!youtube) return null;
  try {
    // Step 1: get the channel's uploads playlist ID (1 unit)
    const channelRes = await youtube.channels.list({
      part: ["contentDetails"],
      mine: true,
    });
    const uploadsPlaylistId =
      channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return null;

    // Step 2: page through recent uploads looking for an exact title match
    // Each playlistItems.list call costs 1 unit; we check up to 3 pages (150 items)
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const itemsRes = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of itemsRes.data.items ?? []) {
        if (item.snippet?.title === title) {
          const videoId = item.snippet.resourceId?.videoId;
          if (!videoId) continue;
          const detail = await youtube.videos.list({
            part: ["status", "contentDetails"],
            id: [videoId],
          });
          const v = detail.data.items?.[0];
          const duration = v?.contentDetails?.duration;
          // "processed" means transcoding finished. A video still transcoding
          // reports "uploaded", but by then YouTube already knows the real
          // duration — whereas a truncated upload never leaves P0D.
          const complete =
            v?.status?.uploadStatus === "processed" ||
            (!!duration && duration !== "P0D");
          return { videoId, complete, publishedAt: item.snippet.publishedAt ?? null };
        }
      }
      pageToken = itemsRes.data.nextPageToken ?? undefined;
      pages++;
    } while (pageToken && pages < 3);
  } catch (err) {
    logger.warn({ err }, "findVideoOnYoutube: search failed");
  }
  return null;
}

/** Retry an async fn up to maxAttempts times with exponential back-off. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn({ attempt, delay, err }, "Transient error — retrying");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
