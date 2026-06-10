/**
 * Populates the playlist from the channel's uploaded videos.
 *
 * Dates are parsed from video TITLES only (not upload date).
 * Videos with no parseable date are excluded (except "Tawzeeh 2 Intro").
 * "Tawzeeh 2 Intro" is placed immediately after the last 21-April video.
 *
 * Run with --confirm to actually insert. Without it, just shows preview.
 */
import { google } from "googleapis";

const DRY_RUN = !process.argv.includes("--confirm");

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const youtube = google.youtube({ version: "v3", auth });

const settingsRes = await fetch("http://localhost:5000/api/settings");
const { youtubePlaylistId: playlistId } = await settingsRes.json();
console.log(`Playlist: ${playlistId}`);

// ── Fetch all channel uploads ────────────────────────────────────────────────
const ch = await youtube.channels.list({ part: ["contentDetails"], mine: true });
const uploadsId = ch.data.items[0].contentDetails.relatedPlaylists.uploads;

console.log("Fetching channel uploads...");
let allVideos = [], pageToken;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId: uploadsId, maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of res.data.items ?? []) {
    allVideos.push({
      videoId: item.snippet?.resourceId?.videoId,
      title: item.snippet?.title,
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);
console.log(`Total channel videos: ${allVideos.length}`);

// ── Parse lecture date from TITLE only ──────────────────────────────────────
const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

function parseLectureDate(title) {
  // "18 April 2026 Lecture X" or "Subject | 21 April 2026"
  let m = title?.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (m) {
    const numM = MONTHS[m[2].toLowerCase()];
    const lectureNum = title.match(/lecture\s+(\d+)/i)?.[1] ?? "0";
    return {
      date: new Date(`${m[3]}-${String(numM).padStart(2,"0")}-${m[1].padStart(2,"0")}`),
      timeKey: String(lectureNum).padStart(3,"0"),
    };
  }
  // "Subject | Teacher | DD-MM-YYYY" or "... | DD-MM-YYYY | ..."
  m = title?.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return { date: new Date(`${m[3]}-${m[2]}-${m[1]}`), timeKey: "000" };
  // "Subject | Teacher | YYYY-MM-DD"
  m = title?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), timeKey: "000" };
  // "code YYYY MM DD HH MM GMT+5..."
  m = title?.match(/(\d{4}) (\d{2}) (\d{2}) (\d{2}) (\d{2}) GMT/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}`), timeKey: `${m[4]}:${m[5]}` };
  return null;
}

// ── Categorise videos ────────────────────────────────────────────────────────
const parsed = allVideos.map(v => ({ ...v, ...parseLectureDate(v.title) }));

const APR_18 = new Date("2026-04-18");
const APR_21 = new Date("2026-04-21");

const tawzeehIntro = parsed.find(v => v.title?.includes("Tawzeeh 2 Intro"));
const excluded = parsed.filter(v => !v.date && !v.title?.includes("Tawzeeh 2 Intro"));
const tooOld = parsed.filter(v => v.date && v.date < APR_18);
const withDate = parsed.filter(v => v.date && v.date >= APR_18)
  .sort((a, b) => a.date - b.date || a.timeKey.localeCompare(b.timeKey) || a.title.localeCompare(b.title));

// ── Print exclusions ─────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════");
console.log("VIDEOS NOT BEING ADDED TO PLAYLIST:");
console.log("════════════════════════════════════════");

if (excluded.length === 0 && tooOld.length === 0) {
  console.log("  (none)");
} else {
  if (excluded.length) {
    console.log(`\n  No date in title (${excluded.length}):`);
    for (const v of excluded) console.log(`    - "${v.title}"`);
  }
  if (tooOld.length) {
    console.log(`\n  Lecture date before 18 April 2026 (${tooOld.length}):`);
    for (const v of tooOld) console.log(`    - "${v.title}"`);
  }
}

// ── Build final sorted list ──────────────────────────────────────────────────
const sorted = [...withDate];
const insertAfterIdx = sorted.reduce((last, v, i) => v.date?.getTime() === APR_21.getTime() ? i : last, -1);
if (tawzeehIntro) {
  if (insertAfterIdx >= 0) sorted.splice(insertAfterIdx + 1, 0, tawzeehIntro);
  else sorted.push(tawzeehIntro);
}

// ── Print sorted playlist preview ────────────────────────────────────────────
console.log("\n════════════════════════════════════════");
console.log(`PLAYLIST ORDER (${sorted.length} videos):`);
console.log("════════════════════════════════════════");
let lastDate = null;
sorted.forEach((v, i) => {
  const d = v.date
    ? `${String(v.date.getUTCDate()).padStart(2,"0")}-${String(v.date.getUTCMonth()+1).padStart(2,"0")}-${v.date.getUTCFullYear()}`
    : "no-date";
  if (d !== lastDate) { console.log(`\n  ── ${d} ──`); lastDate = d; }
  console.log(`  ${String(i+1).padStart(3)}. ${v.title}`);
});

if (DRY_RUN) {
  console.log("\n════════════════════════════════════════");
  console.log("DRY RUN — nothing was added.");
  console.log("Re-run with --confirm to populate the playlist:");
  console.log("  node --env-file=../../.env populate-playlist.mjs --confirm");
  console.log("════════════════════════════════════════");
  process.exit(0);
}

// ── Insert ───────────────────────────────────────────────────────────────────
// Skip videos already in the playlist
let existing = new Set(), pt2;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId, maxResults: 50,
    ...(pt2 ? { pageToken: pt2 } : {}),
  });
  for (const item of res.data.items ?? []) existing.add(item.snippet?.resourceId?.videoId);
  pt2 = res.data.nextPageToken;
} while (pt2);

const toAdd = sorted.filter(v => !existing.has(v.videoId));
console.log(`\nAlready in playlist: ${existing.size}, need to add: ${toAdd.length}`);

let added = 0, failed = 0;
for (const v of toAdd) {
  try {
    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: v.videoId } } },
    });
    added++;
    process.stdout.write(`\rAdded ${added}/${toAdd.length}...`);
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    failed++;
    const isQuota = /quota/i.test(err.message);
    console.error(`\nFailed (${v.title}): ${err.message.slice(0, 100)}`);
    if (isQuota) {
      console.log(`\nQuota exhausted after adding ${added}. Re-run with --confirm tomorrow to continue.`);
      process.exit(1);
    }
  }
}
console.log(`\nDone. Added: ${added}, Failed: ${failed}`);
