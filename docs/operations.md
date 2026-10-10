# Operations runbook

How the system runs day to day, what the background jobs do, and what to do when something goes wrong.
For first-time installation see [SETUP.md](../SETUP.md); for how the code fits together see
[architecture.md](architecture.md).

## What runs where

| Part | Where | Notes |
|---|---|---|
| Admin API + pipeline worker (`api-server`) | Your Windows machine, PM2 process `dtt-api`, port 5000 | Runs the built `dist/index.mjs` — **rebuild before restarting** (`cd artifacts/api-server && node build.mjs`, then `pm2 restart dtt-api --update-env`) |
| Admin dashboard (`pipeline`) | Your machine, PM2 process `dtt-frontend`, port 5173 | Local only, not public |
| Student API (`student-api`) | Render — https://gdrive-youtube-sync.onrender.com | Auto-deploys from every push to `main` |
| Student portal (`pipeline` built with `VITE_APP_MODE=student`) | Vercel — https://hidaya-portal.vercel.app | Auto-deploys from `main`; config in `artifacts/pipeline/vercel.json` |
| Pipeline diagram | GitHub Pages — https://arahmanmdmajid.github.io/gdrive-youtube-sync/app-flow.html | Served from `main` `/docs` |
| Database | Neon PostgreSQL | Shared by both APIs |

A fix to student-facing behaviour usually needs only a push (Render/Vercel redeploy); a fix to the admin API needs a local rebuild + restart.

## The daily timeline

The worker ticks every `WORKER_TICK_MS` (10 minutes in our `.env`), so "at 06:00" really means the first tick after 06:00 PKT.

| When | What | Where in code |
|---|---|---|
| Every tick (if Auto Sync is on) | Scan the registered Drive folders, create `needs_review` jobs, upload `pending` ones, reconcile the playlist | `lib/pipeline.ts` (`runPipelineScan`, `processNextPendingJob`, `reconcilePlaylist`) |
| Every scan | Find new top-level "Google Meet" folders and register them | `discoverDriveSourceFolders` |
| Worker start | Resolve jobs stranded in `processing` by a crash/restart | `reclaimOrphanedJobs` |
| Once a day, first tick after 06:00 PKT | Merge Meet session folders into one folder per code and day | `lib/meetConsolidation.ts` → `consolidateMeetFolders` |
| Straight after the merge | Trash top-level folders left holding only empty sessions | `cleanupEmptyMeetFolders` |

The "ran today" marker is in memory, so a restart after 06:00 triggers one extra run. That is harmless — both steps do nothing when there is nothing to do.

## Google Meet folder housekeeping

**Why it exists.** Meet creates a new top-level `Google Meet` folder whenever its current one is shared. A folder is otherwise reused across days. Link-sharing every new folder therefore made Meet start another one at the next recording (12 appeared in one day), so we do the opposite: nothing is shared per-folder, and sessions are moved into one already-shared folder.

**What the merge does.** Every `<meeting-code> - YYYY/MM/DD HH:mm PKT` session folder is emptied into `<meeting-code> - YYYY/MM/DD` under `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID`.
- Every item moves (videos, Gemini notes, transcripts); file IDs do not change, so jobs keyed by `driveFileId` are unaffected.
- A session already inside the target is renamed in place.
- Sessions on **today's PKT date and on the newest date in Drive are skipped**, because Meet may still be writing to them. A day therefore merges once a newer day exists, usually the morning after the next class day.
- Nothing is ever deleted.

**What the cleanup does.** A top-level `Google Meet` folder whose children are *all* empty session folders goes to the Drive **trash** (recoverable for about 30 days) and its registration in the app is removed. Never touched: the target, the newest top-level folder, any folder holding a latest-date/today session, and any folder with unexpected contents (for example the legacy `Meet Recordings` archive).

**Flags** (all in `.env`, restart `dtt-api --update-env` after changing):

| Variable | Effect |
|---|---|
| `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` | Unset → the daily job does not run at all |
| `DRIVE_CONSOLIDATE_APPLY` | `true` to move files; otherwise it only logs what it would do |
| `DRIVE_CLEANUP_APPLY` | `true` to trash emptied folders; otherwise dry-run |

**Run it by hand** (dry-run unless `apply` is true; `all` sweeps every date instead of the last 14 days; `cleanup` includes the trash step):

```bash
curl -s -X POST localhost:5000/api/drive-folders/consolidate -H "Content-Type: application/json" -d '{"cleanup":true}'
curl -s -X POST localhost:5000/api/drive-folders/consolidate -H "Content-Type: application/json" -d '{"apply":true,"cleanup":true}'
```

**Undo.** Every move and rename is appended to `meet-moves.jsonl` (next to the api-server process; git-ignored) as `{fileId, from, to}`. Reverse a move with Drive's `files.update` using `addParents: from, removeParents: to`. Trashed folders are in the Drive trash (Drive → Trash → Restore); the log lists their IDs.

## Google OAuth tokens

Two accounts share one OAuth app:

| Token | Account | Used for | Scope |
|---|---|---|---|
| `GOOGLE_OAUTH_REFRESH_TOKEN` | YouTube channel owner (arahman1986) | Uploads, playlist, reconcile | `youtube` |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | Account that owns the recordings (jamiahidayah) | Listing/reading/moving Drive files | `drive` |

If either returns `invalid_grant`, mint a new one (SETUP.md §8) and put it in `.env`.

**Tokens expiring about weekly means the consent screen is still in "Testing".** Publish it (Google Cloud → Google Auth Platform → Audience → *Publish app*), then re-mint both tokens — tokens created while in Testing keep the 7-day limit. The `drive` scope is "restricted"; staying unverified is fine for two users (you only see an "unverified app" warning at sign-in). Do not remove the app's access at `myaccount.google.com/permissions` after minting — that revokes the token immediately.

## Troubleshooting

**A job is stuck in `processing`.** It means the process died mid-upload. Restart `dtt-api`; `reclaimOrphanedJobs` adopts the upload if YouTube really has the finished video, otherwise requeues the job. Do not delete the YouTube video first — in past cases the upload had actually succeeded.

**YouTube shows "processing will begin shortly" forever (duration `P0D`).** That upload was interrupted and is a dead husk, not a slow transcode. Never adopt it. The pipeline checks completeness before treating a title match as a success; delete husks in YouTube Studio by video ID and let the job re-upload.

**`invalid_grant` in the logs.** See OAuth tokens above. The error message in the logs names the failing call: playlists/uploads → YouTube token, Drive listing → Drive token.

**Many new top-level "Google Meet" folders appear.** A folder being shared (by anyone, including manually in Drive) is what makes Meet start a new one, so avoid sharing the top-level folders; share only the consolidation target.

**Scan finds no files after a Drive change.** `GET /api/drive-folders` lists what the scan watches. A trashed or unshared folder returns nothing; remove its registration in Settings.

**Daily job did not run.** Check `WORKER_TICK_MS`, that `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` is set, and `pm2 logs dtt-api | grep "Meet consolidation"`. Each run logs a `Meet consolidation summary` and a `Meet cleanup summary` line.

**Port in use / type errors after a schema change.** See SETUP.md → Troubleshooting.

## Checking health

```bash
pm2 list                                   # both processes online
curl -s localhost:5000/api/pipeline/stats  # job counts by status
curl -s localhost:5000/api/jobs?status=processing   # should normally be empty
pm2 logs dtt-api --lines 200 --nostream | grep '"level":50'   # error-level log lines
```
