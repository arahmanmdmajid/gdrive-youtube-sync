# Drive-To-Tube — Claude Code Context

Auto-uploads Google Drive class recordings (a madrasa/Islamic institute in Pakistan) to a YouTube channel. Videos are filtered by meeting code and date, titled from a hardcoded PKT schedule, and managed through a React dashboard.

---

## Project layout

The repo root is the project root — run all commands from there.

```
.                       ← git repo root / Claude Code workspace
├── .env                ← secrets, never committed (template: .env.example)
├── ecosystem.config.cjs  ← PM2 config for the admin API and dashboard
├── README.md · SETUP.md  ← overview · installing on a new machine
├── docs/               ← architecture.md, operations.md, app-flow.html, agent-context.json
├── artifacts/
│   ├── api-server/     ← Express 5 admin API + background pipeline worker (port 5000)
│   ├── pipeline/       ← React 19 + Vite app: admin dashboard (5173) and, built with VITE_APP_MODE=student, the student portal
│   └── student-api/    ← student API (hosted on Render)
└── lib/
    ├── db/             ← Drizzle ORM schema (@workspace/db)
    ├── api-zod/        ← request/response schemas
    └── api-client-react/  ← React Query hooks (hand-maintained)
```

Docs for humans live in `README.md`, `SETUP.md` and `docs/`. **Read `docs/operations.md` before touching the Drive/Meet housekeeping or the OAuth tokens.**

---

## Running the servers

```bash
# Start both with PM2 (preferred — auto-restarts on crash)
pm2 start ecosystem.config.cjs
pm2 list

# Or manually (two terminals):
# Terminal 1
cd artifacts/api-server && node --enable-source-maps --env-file=../../.env ./dist/index.mjs
# Terminal 2
cd artifacts/pipeline && pnpm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:5000

---

## Key source files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/schedule.ts` | Class schedule, title builder, serial numbers |
| `artifacts/api-server/src/lib/scan.ts` · `titles.ts` | Drive scan and job creation · positional slot assignment (`computeGroupAssignments`, `reflowGroupTitles`) |
| `artifacts/api-server/src/lib/upload.ts` · `youtubeMatch.ts` | YouTube upload · retry and title-match helpers (a match only counts if the upload completed) |
| `artifacts/api-server/src/lib/reconcile.ts` · `reclaim.ts` · `worker.ts` | Playlist reconcile · stranded-`processing` recovery · the tick loop. `pipeline.ts` only re-exports all of them |
| `artifacts/api-server/src/lib/googleAuth.ts` | Two OAuth2 singletons: YouTube and Drive (cached, auto-refresh) |
| `artifacts/api-server/src/lib/meetConsolidation.ts` | Daily merge of Meet session folders + trashing of emptied folders |
| `artifacts/student-api/src/lib/subjects.ts` | Groups lectures into subjects (live union of schedule + lecture names) |
| `artifacts/api-server/src/routes/jobs.ts` | Job CRUD, approve, reject/restore, cascade slot |
| `lib/db/src/schema/jobs.ts` | Job table schema (status enum includes "rejected") |
| `lib/api-client-react/src/generated/api.ts` | React Query hooks (manually extended) |
| `artifacts/pipeline/src/pages/jobs.tsx` | Main review UI |
| `artifacts/pipeline/src/pages/dashboard.tsx` | Stats + JobStatusBadge |

---

## Diagrams & agent context

- `docs/app-flow.html` — interactive node/edge diagram of the pipeline (Drive scan → YouTube upload), the job-status lifecycle, and every dashboard page, with click-through detail and hover-to-isolate connections. Live at https://arahmanmdmajid.github.io/gdrive-youtube-sync/app-flow.html (served via GitHub Pages from `main` /docs)
- `docs/agent-context.json` — machine-readable companion covering the same system (nodes, edges, full API route list, job lifecycle, diagram routing model) for AI agents to load as fast context
- Keep both in sync with this file and with the actual pipeline/route code when any of them change

---

## Domain context

- **Institute**: madrasa in Pakistan, PKT timezone (UTC+5)
- **Meeting codes** → days of week:
  - `uys-vqbk-mnn` = Monday + Tuesday
  - `zeo-iaqz-qqu` = Friday + Saturday
- **Cutoff**: only files created on/after 2026-05-17 are scanned
- **YouTube**: videos uploaded as unlisted, added to one playlist

---

## Title format

`{serial} {subjectEn} | {teacherEn} | {DD-MM-YYYY}`  
Example: `1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026`

All LTR — English names only, no Arabic bidi text in titles.

Serial map (Arabic subject → serial):
- 1.1 Jalalain Part 1, 1.2 Jalalain Part 2, 1.3 Jalalain Part 3
- 2.1 Al Fawz ul Kabir, 2.2 Kitab ul Asar, 2.3 Siraji
- 3.1 Hidaya Sani Part 1, 3.2 Hidaya Sani Part 2, 3.3 Hidaya Sani Part 3
- 4.1 Tawzeeh Part 1, 4.2 Tawzeeh Part 2
- 5.1 Sharah Aqaid, 5.2 Falakiyat
- 6.1 Matan ul Kafi, 6.2 Dewan Hamasa

---

## Slot assignment logic

Files are grouped by (PKT date, meeting code), sorted by `createdTime` ascending, then assigned schedule slots by **position index** (not by actual recording time). This handles late-start recordings correctly.

**Cascade**: when a user changes a job's lecture name during review (because a class was skipped), all subsequent `needs_review` siblings for the same day+meeting code are automatically reassigned to the next slots. Jobs whose name a human already confirmed (`lectureNameConfirmed`) are never resequenced.

**Naming conflicts**: if the new name collides with another job's current name, the API returns `409` instead of guessing. The reviewer picks `conflictResolution`:
- `"swap"` — two classes traded places; the other job takes this one's old name
- `"merge"` — one class split across two recordings; both keep the name, both confirmed

---

## Job lifecycle

```
needs_review → pending → processing → done
                                    → failed (retryable)
needs_review → rejected (soft delete — driveFileId kept so pipeline won't re-scan)
rejected → needs_review (via Restore button)
done → removed (video left the playlist; self-heals or restore-done)
```

**Stranded `processing` jobs**: `uploadJob` handles errors, but not the process dying mid-upload — such a row keeps `processing` with no `errorMessage`, and both job processors select only `pending`, so nothing would ever pick it up. `reclaimOrphanedJobs()` sweeps these at worker startup (only one worker runs, so anything in `processing` then is orphaned by definition).

⚠️ **A matching title on YouTube does not mean the upload succeeded.** The video resource is created when an upload *starts*, so an interrupted upload leaves a husk stuck at `uploadStatus: "uploaded"` / duration `P0D` forever ("processing will begin shortly" in Studio). Always verify completeness before adopting a match — adopting a husk marks a job done against a video that will never play.

---

## Important rules / past decisions

- **Never mock the DB** — the project uses real Drizzle + PostgreSQL only
- **After schema changes**: rebuild `lib/db` with `npx tsc -p tsconfig.json` from `lib/db/`
- **One frontend, two builds** — `artifacts/pipeline` is both the admin dashboard and (with `VITE_APP_MODE=student`) the student portal; Vercel builds the latter
- **No OpenAPI spec / codegen** — `lib/api-spec` was removed; the `generated/` folders are edited by hand
- **The `generated/` files are hand-maintained** — `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` carry an orval "do not edit manually" header, but nothing regenerates them here. Edit them directly.
- **After editing `lib/db`, `lib/api-zod` or `lib/api-client-react`**: run `pnpm run typecheck:libs` from the repo root, or the per-package typechecks won't see the change
- **Meet creates a new top-level "Google Meet" folder whenever its current one is shared.** A folder is reused across days until its sharing changes (several hold 3+ days of sessions); sharing each new folder made Meet start another at the next recording (12 appeared in one day). So the code never shares them (an earlier link-sharing step was removed for that reason), and public access comes from one already-shared folder instead.
- **Daily Meet consolidation** (`lib/meetConsolidation.ts`): run by the `meet-merge` GitHub Actions workflow (`.github/workflows/meet-merge.yml`, 08:30 PKT daily, not the PC worker; started by a cron-job.org API call because GitHub's own schedule proved unreliable, see docs/operations.md), sessions (`<code> - YYYY/MM/DD HH:mm PKT`) from every top-level "Google Meet" folder are gathered into one `<code> - YYYY/MM/DD` folder under `DRIVE_CONSOLIDATE_TARGET_FOLDER_ID` (a session already inside the target is renamed in place). Every item moves (videos, Gemini notes), file IDs don't change so jobs are unaffected, nothing is ever deleted, and only sessions on today's PKT date are skipped (each day's sessions merge the following morning). **Dry-run unless the GitHub variable `DRIVE_CONSOLIDATE_APPLY=true`.** Moves are recorded in the `drive_move_log` table (and appended to `meet-moves.jsonl` when run on the PC); reverse by swapping from/to. Manual run: `POST /drive-folders/consolidate` (`{"apply":true}` to apply, `{"all":true}` for the whole backlog, default last 14 days, `{"cleanup":true}` to include the cleanup below).
- **Cleanup of emptied folders** (`cleanupEmptyMeetFolders`, runs after the daily consolidation, **dry-run unless the GitHub variable `DRIVE_CLEANUP_APPLY=true`**): moves to the Drive **trash** (recoverable ~30 days, never a permanent delete) any top-level "Google Meet" folder whose children are *all* empty session folders, and removes its registration. Empty session folders left in a folder that stays (e.g. the newest) are trashed individually after a re-check. Never touches the target, a non-empty session, sessions dated today (an empty one may be a recording still processing), or a folder holding anything else (e.g. the legacy `Meet Recordings` archive).
- **New "Google Meet" folders are auto-registered.** Each scan, `discoverDriveSourceFolders()` finds every `Google Meet` folder the Drive account can see (by ID, not name) and registers new ones, so a day's recordings are scanned before they are merged. Moving files needs the full `drive` scope on `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` (the folder owner's account).
- **Drive sources are multi-folder** (`driveSourceFoldersTable`, managed via `/drive-folders`). The old single `settings.driveFolderId` column was removed — don't reintroduce a one-folder assumption
- **Two separate Google OAuth identities** — `getGoogleAuthClient()` (YouTube uploads) and `getGoogleDriveAuthClient()` (Drive access) in `googleAuth.ts` are independent singletons, driven by `GOOGLE_OAUTH_REFRESH_TOKEN` and `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` respectively (same Client ID/Secret, different consenting account). This exists because the account that hosts the Meet recordings isn't the same as the YouTube channel's account. `getGoogleDriveAuthClient()` falls back to the YouTube credential if the Drive-specific token isn't set.
- **OAuth token** — if you see `invalid_grant`, that token has expired. Re-run the OAuth Playground flow for that account and update `GOOGLE_OAUTH_REFRESH_TOKEN` (YouTube) or `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` (Drive) in `.env`. If either keeps expiring every ~7 days, the OAuth consent screen is still in "Testing" status in Google Cloud Console — publish it to Production (see `SETUP.md` step 8) to stop that.

---

## GitHub

Repository: https://github.com/arahmanmdmajid/gdrive-youtube-sync.git  
Branch: `main` — commit each feature change as it's completed.
