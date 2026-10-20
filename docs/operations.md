# Operations runbook

How the system runs day to day, what the background jobs do, and what to do when something goes wrong.
For first-time installation see [SETUP.md](../SETUP.md); for how the code fits together see
[architecture.md](architecture.md).

## What runs where

| Part | Where | Notes |
|---|---|---|
| Admin API + pipeline worker (`api-server`) | Your Windows machine, PM2 process `dtt-api`, port 5000 | Runs the built `dist/index.mjs` — **rebuild before restarting** (`cd artifacts/api-server && node build.mjs`, then `pm2 restart dtt-api --update-env`) |
| Admin dashboard (`pipeline`) | Your machine, PM2 process `dtt-frontend`, port 5173 | Local only, not public |
| Student API (`student-api`) | Render — https://gdrive-youtube-sync.onrender.com | Auto-deploys from pushes to `main`, but a **build filter** (Render → Settings → Build Filters) only rebuilds when `artifacts/student-api/**`, `lib/db/**`, or `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json` change. If the student API starts to import another `lib/*` package, add it there or its changes will silently not deploy |
| Student portal (`pipeline` built with `VITE_APP_MODE=student`) | Vercel — https://hidaya-portal.vercel.app | Auto-deploys from `main`; config in `artifacts/pipeline/vercel.json` |
| Pipeline diagram | GitHub Pages — https://arahmanmdmajid.github.io/gdrive-youtube-sync/app-flow.html | Served from `main` `/docs` |
| Database | Neon PostgreSQL | Shared by both APIs |

A fix to student-facing behaviour usually needs only a push (Render/Vercel redeploy); a fix to the admin API needs a local rebuild + restart.

## The daily timeline

The worker ticks every `WORKER_TICK_MS` (10 minutes in our `.env`), The Meet folder merge is not part of the worker any more; it runs from GitHub Actions (see below).

| When | What | Where in code |
|---|---|---|
| Every tick (if Auto Sync is on) | Scan the registered Drive folders, create `needs_review` jobs, upload `pending` ones, reconcile the playlist | `lib/worker.ts` (`runPipelineScan` in `scan.ts`, `processNextPendingJob` in `upload.ts`, `reconcilePlaylist` in `reconcile.ts`) |
| Every scan | Find new top-level "Google Meet" folders and register them | `discoverDriveSourceFolders` |
| Worker start | Resolve jobs stranded in `processing` by a crash/restart | `reclaimOrphanedJobs` |
| Once a day, 03:30 UTC (08:30 PKT), in GitHub Actions | Merge Meet session folders into one folder per code and day | `.github/workflows/meet-merge.yml` → `lib/meetConsolidation.ts` `consolidateMeetFolders` |
| Straight after the merge, same job | Trash top-level folders left holding only empty sessions, and empty session folders left elsewhere | `cleanupEmptyMeetFolders` |

## Google Meet folder housekeeping

**Why it exists.** Meet creates a new top-level `Google Meet` folder whenever its current one is shared. A folder is otherwise reused across days. Link-sharing every new folder therefore made Meet start another one at the next recording (12 appeared in one day), so we do the opposite: nothing is shared per-folder, and sessions are moved into one already-shared folder.

**What the merge does.** Every `<meeting-code> - YYYY/MM/DD HH:mm PKT` session folder is emptied into `<meeting-code> - YYYY/MM/DD` under `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID`. The day is the one **in each file's own name** (`<code> (YYYY-MM-DD HH:mm GMT+5)`, or `Meeting started YYYY/MM/DD ...` for a Gemini note), not the session folder's date, because Meet reuses one session folder for a meeting code across several days. A file with no readable date falls back to the session folder's date.
- Every item moves (videos, Gemini notes, transcripts); file IDs do not change, so jobs keyed by `driveFileId` are unaffected.
- A session already inside the target is renamed in place when everything in it belongs to that session's own day.
- Sessions on **today's PKT date are skipped**, and so are files dated today, because Meet may still be writing to them. Everything earlier is merged, so each day's sessions are merged the following morning (Saturday's on Sunday, even if there are no classes in between).
- Nothing is ever deleted.

**What the cleanup does.** A top-level `Google Meet` folder whose children are *all* empty session folders goes to the Drive **trash** (recoverable for about 30 days) and its registration in the app is removed. Empty session folders left inside a folder that stays (the newest top-level folder, or one holding anything else) are trashed on their own too, after a second check that they are still empty. Never touched: the target, the top-level folders themselves when newest, non-empty sessions, sessions dated today, and any folder with unexpected contents (for example the legacy `Meet Recordings` archive).

**Flags** (for the scheduled run these are GitHub repository variables and secrets, see below; the target folder ID is also read from `.env` by the manual route):

| Variable | Effect |
|---|---|
| `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` | Where merged day folders go. Required |
| `DRIVE_CONSOLIDATE_APPLY` | `true` to move files; otherwise the scheduled run only logs what it would do |
| `DRIVE_CLEANUP_APPLY` | `true` to trash emptied folders; otherwise dry-run |

**Run it by hand** (dry-run unless `apply` is true; `all` sweeps every date instead of the last 14 days; `cleanup` includes the trash step):

```bash
curl -s -X POST localhost:5000/api/drive-folders/consolidate -H "Content-Type: application/json" -d '{"cleanup":true}'
curl -s -X POST localhost:5000/api/drive-folders/consolidate -H "Content-Type: application/json" -d '{"apply":true,"cleanup":true}'
```

**Undo.** Every move, rename and trash is recorded in the `drive_move_log` table (kind, fileId, fromId, toId; for a rename toId is the new name) and also appended to `meet-moves.jsonl` (next to the api-server process; git-ignored) as `{kind, fileId, fromId, toId}`. Older lines in the file use `{fileId, from, to}`. Reverse a move with Drive's `files.update` using `addParents: from, removeParents: to`. Trashed folders are in the Drive trash (Drive → Trash → Restore); the log lists their IDs.

## Running the merge from GitHub Actions

`.github/workflows/meet-merge.yml` runs the same merge and cleanup (`dist/scripts/runMeetMerge.mjs`) at 03:30 UTC, which is 08:30 PKT, without the PC. Scheduled runs can start a few minutes late, and GitHub pauses scheduled workflows after 60 days with no repository activity. Start one by hand from Actions → Meet merge → Run workflow. A run fails (red) if any group failed.

**What starts it.** GitHub's own `schedule` trigger is not reliable: it did not fire at all on 12 Oct 2026 (issue #15), and GitHub does not guarantee scheduled runs. So a free cron-job.org job named `meet-merge-dispatch` calls GitHub's API every day at **03:30 UTC** (06:30 Saudi, 08:30 PKT), which starts the workflow just like the Run workflow button. The GitHub `schedule` is kept as a backup. A second run on the same day does nothing harmful: runs go one at a time and a repeat merge finds nothing to move.

The cron-job.org job sends:

- `POST https://api.github.com/repos/arahmanmdmajid/gdrive-youtube-sync/actions/workflows/meet-merge.yml/dispatches`, body `{"ref":"main"}`, time zone UTC
- headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json` (a `User-Agent` header is set too, but cron-job.org says it ignores it, and the calls work)
- success is `204 No Content`; cron-job.org emails if a call fails and disables a job after 25 failures in a row

The token is a fine-grained personal access token (name `meet-merge-dispatch`, this repository only, permission Actions: read and write, nothing else). It has **no expiry date set**, so rotate it once a year: create a new one with the same settings, put it in the `Authorization` header of the cron-job.org job, press Test run (expect 204 and a new `workflow_dispatch` run in Actions), then delete the old token under GitHub → Settings → Developer settings. If the token stops working, the daily run falls back to GitHub's own schedule only.

Set these under Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | same as `.env` |
| Secret | `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | the Drive token (full `drive` scope) from `.env` |
| Secret | `DATABASE_URL` | same as `.env` |
| Secret | `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` | same as `.env` |
| Variable | `DRIVE_CONSOLIDATE_APPLY`, `DRIVE_CLEANUP_APPLY` | `true` to apply; unset or anything else is a dry-run |

The PC worker no longer runs the merge, so the workflow is the only scheduled runner. Do not apply the manual route (`POST /drive-folders/consolidate`) around 03:30 UTC while the workflow runs, or two runners could create duplicate day folders. When the token expires (`invalid_grant`), update it in `.env` and in the GitHub secret.

## One-off: filing the old "Meet Recordings" archive

The flat `Meet Recordings` folder from before the daily merge (files named `<code> (YYYY-MM-DD HH:mm GMT+5)` plus Gemini notes) is not touched by the daily merge. `src/scripts/mergeArchive.ts` files it into the same `<code> - YYYY/MM/DD` day folders under the target. It only moves, never deletes, and logs every move to `drive_move_log` and `meet-moves.jsonl`. Gemini notes have no meeting code, so a note goes to the recording that started in the same minute; if none or several did, it stays. Files not named like Meet recordings, and subfolders, stay too, and the run lists them.

Run it from `artifacts/api-server` after `node build.mjs`, not around 03:30 UTC while the daily merge runs. It is a dry-run unless `--apply` is given; `--only YYYY-MM-DD` limits it to one date, and it is safe to rerun:

```bash
NODE_ENV=production node --env-file=../../.env dist/scripts/mergeArchive.mjs --source <archive folder id>
NODE_ENV=production node --env-file=../../.env dist/scripts/mergeArchive.mjs --source <archive folder id> --only 2026-08-18 --apply
```

`--source` is the `Meet Recordings` folder, or the folder that holds it. Undo a date by swapping `fromId` and `toId` of its rows in `drive_move_log`.

## One-off: refiling files from the wrong day folder

Before the daily merge filed files by their own date (#22), a day folder could hold files from several days, because Meet reuses a session folder across days. `src/scripts/refileMixedDays.ts` moves each file whose own day (from its name) differs from its folder's day into `<meeting-code> - <its day>` under the target, creating that folder if needed. It only moves, never deletes, and logs every move to `drive_move_log` and `meet-moves.jsonl`. Names with no readable date and files dated today stay where they are.

Run it from `artifacts/api-server` after `node build.mjs`, not around 03:30 UTC while the daily merge runs. It is a dry-run unless `--apply` is given; `--only YYYY-MM-DD` limits it to files of that day, and it is safe to rerun:

```bash
NODE_ENV=production node --env-file=../../.env dist/scripts/refileMixedDays.mjs
NODE_ENV=production node --env-file=../../.env dist/scripts/refileMixedDays.mjs --only 2026-08-22 --apply
```

A folder can end up empty if all its files belonged to other days; it is left for a human. Undo a day by swapping `fromId` and `toId` of its rows in `drive_move_log`.

## Google OAuth tokens

Two accounts share one OAuth app:

| Token | Account | Used for | Scope |
|---|---|---|---|
| `GOOGLE_OAUTH_REFRESH_TOKEN` | YouTube channel owner (arahman1986) | Uploads, playlist, reconcile | `youtube` |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | Account that owns the recordings (jamiahidayah) | Listing/reading/moving Drive files | `drive` |

If either returns `invalid_grant`, mint a new one (SETUP.md §8) and put it in `.env`.

**Tokens expiring about weekly means the consent screen is still in "Testing".** Publish it (Google Cloud → Google Auth Platform → Audience → *Publish app*; the button stays greyed until Branding has the home-page and privacy-policy links, which are `docs/index.html` and `docs/privacy.html` served by GitHub Pages, so keep those pages online), then re-mint both tokens — tokens created while in Testing keep the 7-day limit. The `drive` scope is "restricted"; staying unverified is fine for two users (you only see an "unverified app" warning at sign-in). Do not remove the app's access at `myaccount.google.com/permissions` after minting — that revokes the token immediately.

## Student portal admin sign-in

There is one admin account (username **`admin`**, role `admin`). It signs in at https://hidaya-portal.vercel.app and sees the class-progress and student-management pages. The local dashboard at `localhost:5173` has no login at all. Passwords are stored only as bcrypt hashes, so a forgotten password **cannot be recovered, only reset**.

**If you are locked out**, run the reset tool from this machine (it needs `.env`, which is the safeguard: only someone with this computer can use it). In PowerShell, one line at a time, typing the same password twice at the hidden prompts (8+ characters; keep it easy to type):

```powershell
cd D:\Dev\gdrive-youtube-sync\artifacts\student-api
$env:NEW_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'New admin password' -AsSecureString)))
$env:NEW_ADMIN_PASSWORD_CONFIRM = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Type it again' -AsSecureString)))
node --env-file=../../.env reset-admin-password.mjs
Remove-Item Env:NEW_ADMIN_PASSWORD, Env:NEW_ADMIN_PASSWORD_CONFIRM
```

It prints `Password updated for "admin". New password verifies: true`. It refuses to run if the two entries differ, the password is shorter than 8 characters, or there is not exactly one admin account. It takes effect immediately; anyone already signed in stays signed in until their 30-day token expires. A wrong password on the sign-in page shows "Incorrect username or password" and keeps what you typed; if the correct one is rejected, suspect a typo at the hidden prompt or the browser autofilling an old saved password.

**Test a password without the browser** (isolates autofill from a real mismatch):

```powershell
$pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Admin password' -AsSecureString)))
Invoke-RestMethod -Method Post -Uri https://gdrive-youtube-sync.onrender.com/api/auth/login -ContentType 'application/json' -Body (@{username='admin';password=$pw} | ConvertTo-Json) | Select-Object -ExpandProperty user
```

A user object means it works; `401 Unauthorized` means it does not match. The free Render instance can take about 50 seconds to wake up.

**Students' passwords** are different: signed in as admin, use the *Reset password* button on the Students page. Prevention: keep the admin password in a password manager.

## Troubleshooting

**A job is stuck in `processing`.** It means the process died mid-upload. Restart `dtt-api`; `reclaimOrphanedJobs` adopts the upload if YouTube really has the finished video, otherwise requeues the job. Do not delete the YouTube video first — in past cases the upload had actually succeeded.

**YouTube shows "processing will begin shortly" forever (duration `P0D`).** That upload was interrupted and is a dead husk, not a slow transcode. Never adopt it. The pipeline checks completeness before treating a title match as a success; delete husks in YouTube Studio by video ID and let the job re-upload.

**`invalid_grant` in the logs.** See OAuth tokens above. The error message in the logs names the failing call: playlists/uploads → YouTube token, Drive listing → Drive token.

**Many new top-level "Google Meet" folders appear.** A folder being shared (by anyone, including manually in Drive) is what makes Meet start a new one, so avoid sharing the top-level folders; share only the consolidation target.

**Scan finds no files after a Drive change.** `GET /api/drive-folders` lists what the scan watches. A trashed or unshared folder returns nothing; remove its registration in Settings.

**Daily job did not run.** Open GitHub → Actions → Meet merge and the cron-job.org job history. No `workflow_dispatch` run at about 03:30 UTC means the cron-job.org call failed (expired or deleted token, job disabled) and no `schedule` run means GitHub skipped or paused it (60 days without repo activity pauses scheduled workflows; use Run workflow). A red run means a group failed or the credentials are wrong; the log has a `Meet consolidation summary` and a `Meet cleanup summary` line.

**Port in use / type errors after a schema change.** See SETUP.md → Troubleshooting.

## Decision history

Every proposal and review decision is appended to the `job_decisions` table (who, when, old and new title, old and new status, and the other jobs a cascade, swap or merge changed, linked by `group_event_id`). Nothing is overwritten. History before this table existed cannot be recovered, and a failed write is logged (`Could not write decision history`) without blocking the review action.

After pulling a version that adds the table, create it once with `pnpm --filter @workspace/db run push` (additive), then rebuild and restart `dtt-api`. Until the table exists, review still works and the logs show the warning above.

Read a job's history (read-only):

```sql
select created_at, event_type, role, detail, from_title, to_title, from_status, to_status
from job_decisions where job_id = <id> order by id;
```

## Checking health

```bash
pm2 list                                   # both processes online
curl -s localhost:5000/api/pipeline/stats  # job counts by status
curl -s localhost:5000/api/jobs?status=processing   # should normally be empty
pm2 logs dtt-api --lines 200 --nostream | grep '"level":50'   # error-level log lines
```
