import type { getYoutubeClient } from "./youtubeClient";

export type Youtube = NonNullable<ReturnType<typeof getYoutubeClient>>;

// videos.list takes at most 50 ids per call and costs 1 quota unit however many it gets.
const BATCH_SIZE = 50;

/**
 * Seconds in an ISO 8601 duration such as "PT1H2M30S". Null for anything unreadable and for a zero
 * length: an upload that never finished reports "P0D", which is not a real length.
 */
export function parseIsoDuration(value: string | null | undefined): number | null {
  const m = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [d, h, min, s] = [m[1], m[2], m[3], m[4]].map((x) => Number(x ?? 0));
  const seconds = d! * 86400 + h! * 3600 + min! * 60 + s!;
  return seconds > 0 ? seconds : null;
}

/** Lengths in seconds by video id. Videos YouTube does not know, or has no real length for, are left out. */
export async function fetchDurations(youtube: Youtube, videoIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(videoIds)];
  const result = new Map<string, number>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const res = await youtube.videos.list({ part: ["contentDetails"], id: ids.slice(i, i + BATCH_SIZE) });
    for (const item of res.data.items ?? []) {
      const seconds = parseIsoDuration(item.contentDetails?.duration);
      if (item.id && seconds) result.set(item.id, seconds);
    }
  }
  return result;
}
