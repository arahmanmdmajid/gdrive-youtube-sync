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

The worker ticks every `WORKER_TICK_MS` (10 minutes in our `.env`), so "at 06:00" really means the first tick after 06:00 PKT.

| When | What | Where in code |
|---|---|---|
| Every tick (if Auto Sync is on) | Scan the registered Drive folders, create `needs_review` jobs, upload `pending` ones, reconcile the playlist | `lib/worker.ts` (`runPipelineScan` in `scan.ts`, `processNextPendingJob` in `upload.ts`, `reconcilePlaylist` in `reconcile.ts`) |
| Every scan | Find new top-level "Google Meet" folders and register them | `discoverDriveSourceFolders` |
| Worker start | Resolve jobs stranded in `processing` by a crash/restart | `reclaimOrphanedJobs` |
| Once a day, first tick after 06:00 PKT | Merge Meet session folders into one folder per code and day | `lib/meetConsolidation.ts` → `consolidateMeetFolders` |
| Straight after the merge | Trash top-level folders left holding only empty sessions, and empty session folders left elsewhere | `cleanupEmptyMeetFolders` |

The "ran today" marker is in memory, so a restart after 06:00 triggers one extra run. That is harmless — both steps do nothing when there is nothing to do.

## Google Meet folder housekeeping

**Why it exists.** Meet creates a new top-level `Google Meet` folder whenever its current one is shared. A folder is otherwise reused across days. Link-sharing every new folder therefore made Meet start another one at the next recording (12 appeared in one day), so we do the opposite: nothing is shared per-folder, and sessions are moved into one already-shared folder.

**What the merge does.** Every `<meeting-code> - YYYY/MM/DD HH:mm PKT` session folder is emptied into `<meeting-code> - YYYY/MM/DD` under `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID`.
- Every item moves (videos, Gemini notes, transcripts); file IDs do not change, so jobs keyed by `driveFileId` are unaffected.
- A session already inside the target is renamed in place.
- Sessions on **today's PKT date are skipped**, because Meet may still be writing to them. Everything earlier is merged, so each day's sessions are merged the following morning (Saturday's on Sunday, even if there are no classes in between).
- Nothing is ever deleted.

**What the cleanup does.** A top-level `Google Meet` folder whose children are *all* empty session folders goes to the Drive **trash** (recoverable for about 30 days) and its registration in the app is removed. Empty session folders left inside a folder that stays (the newest top-level folder, or one holding anything else) are trashed on their own too, after a second check that they are still empty. Never touched: the target, the top-level folders themselves when newest, non-empty sessions, sessions dated today, and any folder with unexpected contents (for example the legacy `Meet Recordings` archive).

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

**Undo.** Every move, rename and trash is recorded in the `drive_move_log` table (kind, fileId, fromId, toId; for a rename toId is the new name) and also appended to `meet-moves.jsonl` (next to the api-server process; git-ignored) as `{kind, fileId, fromId, toId}`. Older lines in the file use `{fileId, from, to}`. Reverse a move with Drive's `files.update` using `addParents: from, removeParents: to`. Trashed folders are in the Drive trash (Drive → Trash → Restore); the log lists their IDs.

## Running the merge from GitHub Actions

`.github/workflows/meet-merge.yml` runs the same merge and cleanup (`dist/scripts/runMeetMerge.mjs`) at 01:00 UTC, which is 06:00 PKT, without the PC. Scheduled runs can start a few minutes late, and GitHub pauses scheduled workflows after 60 days with no repository activity. Start one by hand from Actions → Meet merge → Run workflow. A run fails (red) if any group failed.

Set these under Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | same as `.env` |
| Secret | `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | the Drive token (full `drive` scope) from `.env` |
| Secret | `DATABASE_URL` | same as `.env` |
| Secret | `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` | same as `.env` |
| Variable | `DRIVE_CONSOLIDATE_APPLY`, `DRIVE_CLEANUP_APPLY` | `true` to apply; unset or anything else is a dry-run |

Only one runner may apply. While the PC worker still has `DRIVE_CONSOLIDATE_APPLY=true` in `.env`, keep both variables unset (dry-run) in GitHub, or two runners could create duplicate day folders. When the token expires (`invalid_grant`), update it in `.env` and in the GitHub secret.

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

**Daily job did not run.** Check `WORKER_TICK_MS`, that `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` is set, and `pm2 logs dtt-api | grep "Meet consolidation"`. Each run logs a `Meet consolidation summary` and a `Meet cleanup summary` line.

**Port in use / type errors after a schema change.** See SETUP.md → Troubleshooting.

## Checking health

```bash
pm2 list                                   # both processes online
curl -s localhost:5000/api/pipeline/stats  # job counts by status
curl -s localhost:5000/api/jobs?status=processing   # should normally be empty
pm2 logs dtt-api --lines 200 --nostream | grep '"level":50'   # error-level log lines
```
