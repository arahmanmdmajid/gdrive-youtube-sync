/**
 * Resume playlist build — adds any missing videos (since 18-Apr-2026) that
 * aren't already in the playlist, in chronological order.
 * Safe to re-run: skips videos already present.
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

// ── Fetch all channel videos ────────────────────────────────────────────────
console.log("Fetching channel videos...");
const ch = await youtube.channels.list({ part: ["contentDetails"], mine: true });
const uploadsId = ch.data.items[0].contentDetails.relatedPlaylists.uploads;

let allVideos = [], pageToken;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId: uploadsId, maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of res.data.items ?? []) {
    allVideos.push({ videoId: item.snippet?.resourceId?.videoId, title: item.snippet?.title });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);
console.log(`Total videos on channel: ${allVideos.length}`);

// ── Parse lecture date from any title format ────────────────────────────────
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

const cutoff = new Date("2026-04-18");
const ordered = allVideos
  .map(v => ({ ...v, ...parseLectureDate(v.title) }))
  .filter(v => v.date && v.date >= cutoff)
  .sort((a, b) => a.date - b.date || a.timeKey.localeCompare(b.timeKey));
console.log(`Videos since 18-Apr-2026: ${ordered.length}`);

// ── Fetch what's already in the playlist ───────────────────────────────────
console.log("Fetching current playlist...");
const alreadyInPlaylist = new Set();
pageToken = undefined;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId, maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of res.data.items ?? []) {
    alreadyInPlaylist.add(item.snippet?.resourceId?.videoId);
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);
console.log(`Already in playlist: ${alreadyInPlaylist.size}`);

// ── Add only missing videos (in order) ────────────────────────────────────
const toAdd = ordered.filter(v => !alreadyInPlaylist.has(v.videoId));
console.log(`Videos to add: ${toAdd.length}`);

if (toAdd.length === 0) {
  console.log("Playlist is already complete!");
  process.exit(0);
}

let added = 0, failed = 0;
for (const v of toAdd) {
  try {
    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: v.videoId } } },
    });
    added++;
    process.stdout.write(`\rAdded ${added}/${toAdd.length}: ${v.title.slice(0, 60)}`);
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    failed++;
    const isQuota = /quota/i.test(err.message);
    console.error(`\nFailed (${v.videoId}): ${err.message.slice(0, 80)}`);
    if (isQuota) {
      console.log(`\nQuota hit after adding ${added} videos. Run this script again tomorrow.`);
      break;
    }
  }
}

console.log(`\n\nDone. Added: ${added}, Failed: ${failed}`);
console.log(`Playlist now has approximately ${alreadyInPlaylist.size + added} entries.`);
