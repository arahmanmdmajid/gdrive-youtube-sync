# Architecture

Drive-To-Tube turns Google Meet class recordings into titled, reviewed YouTube uploads, and serves the finished lectures to students.
The interactive pipeline diagram ([app-flow.html](app-flow.html)) shows the flow visually; this page explains how the code is organised.
Day-to-day running is in [operations.md](operations.md).

## Overview

```
Google Drive ──scan──▶ api-server (Express + worker) ──upload──▶ YouTube (unlisted, one playlist)
 (Meet recordings)            │  ▲
                              │  └── admin dashboard (artifacts/pipeline, local)
                              ▼
                        PostgreSQL (Neon) ◀──── student-api (Render) ◀──── student portal (Vercel)
```

| Package | What it is |
|---|---|
| `artifacts/api-server` | Admin API on port 5000 plus the background worker: scan, filter, title, upload, reconcile, Meet-folder housekeeping |
| `artifacts/pipeline` | One React 19 + Vite app built two ways: the **admin dashboard** (default) and the **student portal** (`VITE_APP_MODE=student`) |
| `artifacts/student-api` | Student-facing API: accounts, subjects/lectures, progress, library, schedule |
| `lib/db` | Drizzle ORM schema and client (`@workspace/db`) shared by both APIs |
| `lib/api-zod`, `lib/api-client-react` | Request/response schemas and React Query hooks. **Hand-maintained** despite the header history — edit them directly |

pnpm workspace, TypeScript throughout. After editing any `lib/*` package run `pnpm run typecheck:libs` from the repo root, otherwise the per-package typechecks do not see the change.

## Data model (`lib/db/src/schema`)

| Table | Purpose |
|---|---|
| `jobs` | One row per recording: Drive file, proposed/final YouTube title, status, YouTube video ID, duration |
| `lecture_names` | Admin-editable "Serial Subject \| Teacher" picklist used when reviewing |
| `schedule_slots` | The weekly timetable (day + time slot → subject/teacher, English and Arabic) |
| `settings` | Single row: playlist, library/audio folders, auto-sync, interval, student invite code |
| `drive_source_folders` | Drive folders the scan watches (several; managed via `/drive-folders`) |
| `library_resources` | Catalogued PDFs/audio for the student library |
| `users` | Student and admin accounts (student portal) |

## The pipeline

1. **Scan** (`lib/scan.ts` → `runPipelineScan`). For each registered Drive folder, `collectVideoFiles` lists videos directly in it and in subfolders whose name starts with a known meeting code (`lib/schedule.ts` → `extractMeetingCode`).
2. **Filter** (`lib/filter.ts`). Drops files before the cutoff date, with an unknown meeting code, or on the wrong weekday for their code.
3. **Group and name.** Files are grouped by (PKT date, meeting code), sorted by creation time and assigned that day's schedule slots **by position**, not by timestamp, so a late-starting class still gets the right subject. This produces `proposedTitle` in the form `{serial} {subject} | {teacher} | {DD-MM-YYYY}`.
4. **Review** (admin dashboard → Jobs). A human confirms or corrects the lecture name. Correcting one cascades down the rest of that day's unconfirmed jobs; a name that collides with another job returns `409` and the reviewer chooses *swap* or *merge* (`routes/jobs.ts`, `applyLectureNameChange`).
5. **Upload** (`uploadJob`). Approved jobs go to YouTube one at a time, unlisted, then into the playlist; audio recordings are first muxed with a subject image (`lib/audioMux.ts`, `audioPipeline.ts`).
6. **Reconcile** (`reconcilePlaylist`). Keeps job state in step with the real playlist (`done` ⇄ `removed`).

Job states: `needs_review → pending → processing → done` (`failed` is retryable, `rejected` is a soft delete, `removed` means it left the playlist).

### Failure handling worth knowing
- A job can be left in `processing` if the process dies mid-upload. `reclaimOrphanedJobs` fixes this at startup.
- A video that exists on YouTube with the right title is **not** proof the upload finished: an interrupted upload leaves a zero-duration husk. `findVideoOnYoutube` reports whether the upload is complete and every caller checks it.

## Google Drive and the two accounts

`lib/googleAuth.ts` keeps two independent OAuth clients sharing one OAuth app: the YouTube channel owner (uploads) and the Drive owner (reading, moving files). `getDriveClient()` uses the Drive identity and falls back to the YouTube one if no separate Drive token is set.

### Meet folder housekeeping (`lib/meetConsolidation.ts`)
Meet creates a new top-level "Google Meet" folder whenever its current one is shared, with one subfolder per session. A daily job gathers those into a single already-shared folder as one `<code> - YYYY/MM/DD` folder per code and day, then trashes the emptied session folders and top-level folders. Rules, flags and undo steps are in [operations.md](operations.md). Newly seen top-level folders are still registered automatically by `discoverDriveSourceFolders` so a day's recordings are scanned before they are merged.

## Student portal

`artifacts/student-api` reads the same database. Lectures are the `done` jobs, grouped into subjects by the serial prefix of their title (`lib/subjects.ts`: the live union of `schedule_slots` and `lecture_names`, so a rename in the admin app shows up immediately). Registration needs an invite code (stored in `settings`, falling back to `INVITE_CODE`). Auth is a JWT signed with `JWT_SECRET`.

## Conventions

- The DB is real PostgreSQL everywhere; there are no mocks.
- Keep `docs/app-flow.html`, `docs/agent-context.json` and `CLAUDE.md` in step with the code when routes or pipeline behaviour change.
- The two APIs duplicate a little on purpose (for example `libraryCategories.ts`) instead of sharing a package; keep the copies' comments pointing at each other.
- Commit each feature as it is completed; Render and Vercel deploy from `main`.
