# Drive-To-Tube — Claude Code Context

Auto-uploads Google Drive class recordings (a madrasa/Islamic institute in Pakistan) to a YouTube channel. Videos are filtered by meeting code and date, titled from a hardcoded PKT schedule, and managed through a React dashboard.

---

## Project layout

The working directory is `Drive-To-Tube\Drive-To-Tube\` (one level inside the clone root — the outer folder is just the workspace container).

```
Drive-To-Tube/          ← git repo root / Claude Code workspace
└── Drive-To-Tube/      ← actual project root (run all commands from here)
    ├── .env            ← secrets, never committed
    ├── ecosystem.config.cjs  ← PM2 config for both servers
    ├── SETUP.md        ← full setup guide for new machines
    ├── artifacts/
    │   ├── api-server/     ← Express 5 API + background pipeline worker (port 5000)
    │   └── pipeline/       ← React 19 + Vite frontend (port 5173)
    └── lib/
        ├── db/             ← Drizzle ORM schema (@workspace/db)
        └── api-client-react/  ← generated React Query hooks (@workspace/api-client-react)
```

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
| `artifacts/api-server/src/lib/pipeline.ts` | Drive scan, positional slot assignment |
| `artifacts/api-server/src/lib/googleAuth.ts` | OAuth2 singleton (cached, auto-refresh) |
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
- **Frontend is `artifacts/pipeline`** — not `artifacts/mockup-sandbox` (that's a component preview server)
- **The `generated/` files are hand-maintained** — `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` carry an orval "do not edit manually" header, but nothing regenerates them here. Edit them directly.
- **After editing `lib/db`, `lib/api-zod` or `lib/api-client-react`**: run `pnpm run typecheck:libs` from the repo root, or the per-package typechecks won't see the change
- **Drive sources are multi-folder** (`driveSourceFoldersTable`, managed via `/drive-folders`). The old single `settings.driveFolderId` column was removed — don't reintroduce a one-folder assumption
- **OAuth token** — if you see `invalid_grant`, the refresh token has expired. Re-run the OAuth Playground flow and update `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env`

---

## GitHub

Repository: https://github.com/arahmanmdmajid/gdrive-youtube-sync.git  
Branch: `main` — commit each feature change as it's completed.
