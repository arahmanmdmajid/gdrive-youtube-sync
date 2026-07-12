// Fetch canonical IDs from the local API (no DB client needed)
const jobsRes = await fetch("http://localhost:5000/api/jobs?status=done");
const dbJobs = await jobsRes.json();
const canonicalIds = new Set(dbJobs.map(j => j.youtubeVideoId).filter(Boolean));
console.log(`Canonical video IDs in DB: ${canonicalIds.size}`);

const { google } = await import("googleapis");

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const youtube = google.youtube({ version: "v3", auth });

const ch = await youtube.channels.list({ part: ["contentDetails"], mine: true });
const uploadsId = ch.data.items[0].contentDetails.relatedPlaylists.uploads;

let allVideos = [];
let pageToken;
do {
  const res = await youtube.playlistItems.list({
    part: ["snippet"], playlistId: uploadsId, maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of res.data.items ?? []) {
    allVideos.push({
      title: item.snippet?.title,
      videoId: item.snippet?.resourceId?.videoId,
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`Total videos on channel: ${allVideos.length}`);

// Group by title, keep the canonical DB video ID (or first seen)
const byTitle = {};
for (const v of allVideos) {
  if (!byTitle[v.title]) byTitle[v.title] = [];
  byTitle[v.title].push(v);
}

const toDelete = [];
for (const [, vids] of Object.entries(byTitle)) {
  if (vids.length === 1) continue;
  const keepId = vids.find(v => canonicalIds.has(v.videoId))?.videoId ?? vids[0].videoId;
  for (const v of vids) {
    if (v.videoId !== keepId) toDelete.push(v.videoId);
  }
}

console.log(`\nDuplicates to delete: ${toDelete.length}`);

let deleted = 0, failed = 0;
for (const videoId of toDelete) {
  try {
    await youtube.videos.delete({ id: videoId });
    deleted++;
    process.stdout.write(`\rDeleted ${deleted}/${toDelete.length}...`);
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    failed++;
    console.error(`\nFailed to delete ${videoId}: ${err.message}`);
  }
}

console.log(`\nDone. Deleted: ${deleted}, Failed: ${failed}`);
