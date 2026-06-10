/**
 * Reorder the YouTube playlist by parsing the lecture date from each video title.
 * Works with all title formats:
 *   - "Subject | Teacher | DD-MM-YYYY"
 *   - "Subject | Teacher | YYYY-MM-DD"
 *   - "code YYYY MM DD HH MM GMT+5..."  (raw Drive filenames)
 *
 * Strategy: delete all playlist items, then re-insert in sorted order.
 * Safe to re-run if quota runs out mid-way — just run again next day.
 */
import { google } from "googleapis";

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const youtube = google.youtube({ version: "v3", auth });

const settingsRes = await fetch("http://localhost:5000/api/settings");
const { youtubePlaylistId: playlistId } = await settingsRes.json();
console.log(`Playlist: ${playlistId}`);

// ── Parse lecture date + intra-day sort key from any title format ──────────
function parseLectureDate(title) {
  // "Subject | Teacher | DD-MM-YYYY"
  let m = title?.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return { date: new Date(`${m[3]}-${m[2]}-${m[1]}`), timeKey: "00:00" };
  // "Subject | Teacher | YYYY-MM-DD"
  m = title?.match(/(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), timeKey: "00:00" };
  // "code YYYY MM DD HH MM GMT+5..."
  m = title?.match(/(\d{4}) (\d{2}) (\d{2}) (\d{2}) (\d{2}) GMT/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), timeKey: `${m[4]}:${m[5]}` };
  return null;
}

// ── Fetch all current playlist items ─────────────────────────────────────
console.log("Fetching playlist...");
let items = [], pageToken;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId, maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of res.data.items ?? []) {
    items.push({
      playlistItemId: item.id,
      videoId: item.snippet?.resourceId?.videoId,
      title: item.snippet?.title,
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);
console.log(`Found ${items.length} videos in playlist`);

// ── Parse and sort ────────────────────────────────────────────────────────
const parsed = items.map(v => ({ ...v, ...parseLectureDate(v.title) }));

const unparseable = parsed.filter(v => !v.date);
if (unparseable.length) {
  console.warn(`\nWarning: can't parse date from ${unparseable.length} title(s) — they'll be placed at the end:`);
  for (const v of unparseable) console.warn(`  "${v.title}"`);
}

const APR_21 = new Date("2026-04-21");

const withDate = parsed.filter(v => v.date).sort((a, b) => a.date - b.date || a.timeKey.localeCompare(b.timeKey));
const noDate = parsed.filter(v => !v.date);

// "Tawzeeh 2 Intro" has no date — insert it right after the last 21-April video
const insertAfterIdx = withDate.reduce((last, v, i) => v.date?.getTime() === APR_21.getTime() ? i : last, -1);

const sorted = [...withDate];
const tawzeehIntro = noDate.find(v => v.title?.includes("Tawzeeh 2 Intro"));
const otherNoDate = noDate.filter(v => !v.title?.includes("Tawzeeh 2 Intro"));

if (tawzeehIntro && insertAfterIdx >= 0) {
  sorted.splice(insertAfterIdx + 1, 0, tawzeehIntro);
} else if (tawzeehIntro) {
  sorted.push(tawzeehIntro);
}
sorted.push(...otherNoDate);

console.log("\nSorted order:");
let lastDate = null;
for (const v of sorted) {
  const dateStr = v.date ? v.date.toISOString().slice(0, 10) : "no-date";
  if (dateStr !== lastDate) { console.log(`\n  ── ${dateStr} ──`); lastDate = dateStr; }
  console.log(`  ${v.title}`);
}

// ── Check if already in correct order ────────────────────────────────────
const alreadySorted = sorted.every((v, i) => v.playlistItemId === items[i]?.playlistItemId);
if (alreadySorted) {
  console.log("\nPlaylist is already in the correct order. Nothing to do.");
  process.exit(0);
}

// ── Delete all, then re-insert in order ──────────────────────────────────
console.log(`\nDeleting ${items.length} current entries...`);
let deleted = 0;
for (const item of items) {
  await youtube.playlistItems.delete({ id: item.playlistItemId });
  deleted++;
  process.stdout.write(`\rDeleted ${deleted}/${items.length}...`);
  await new Promise(r => setTimeout(r, 300));
}
console.log(`\nDeleted ${deleted} entries.`);

console.log(`\nRe-inserting ${sorted.length} videos in sorted order...`);
let added = 0, failed = 0;
for (const v of sorted) {
  try {
    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: v.videoId } } },
    });
    added++;
    process.stdout.write(`\rAdded ${added}/${sorted.length}...`);
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    failed++;
    const isQuota = /quota/i.test(err.message);
    console.error(`\nFailed (${v.title}): ${err.message.slice(0, 80)}`);
    if (isQuota) {
      console.log(`\nQuota hit after adding ${added}. Run resume-playlist.mjs tomorrow to add the remaining videos.`);
      process.exit(1);
    }
  }
}

console.log(`\nDone. Added: ${added}, Failed: ${failed}`);
