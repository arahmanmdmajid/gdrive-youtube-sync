# Drive-To-Tube

----

## Introduction

Uploads a madrasa's Google Meet class recordings from Google Drive to YouTube, titled from the weekly timetable, behind a human review step. A separate student portal then serves the finished lectures.

Built for Hidayah Academy for Islamic Education (Section B/H, 6th year Dars-e-Nizami). The institute works in **PKT (UTC+5)**; the timetable is in [docs/class-schedule.md](docs/class-schedule.md).

**See it working:** [interactive pipeline diagram](https://arahmanmdmajid.github.io/gdrive-youtube-sync/app-flow.html) · [student portal](https://hidaya-portal.vercel.app)

## How it works

```
Drive (Meet recordings) → scan → name from timetable → human review → YouTube (unlisted, one playlist)
                                                                              ↓
                                            student portal ← student API ← database
```

1. A worker scans the Drive folders it watches and creates a job per recording, with a proposed title like `1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026`.
2. Staff review the jobs in the admin dashboard, correct the lecture name if a class was skipped, and approve.
3. Approved jobs are uploaded to YouTube as unlisted videos and added to the playlist.
4. Students sign in to the portal (invite code) to watch lectures grouped by subject and track their progress.

A background job also tidies the many folders Google Meet creates, so recordings end up in one shared folder per meeting code and day.

### Review automation (shadow mode)

Reviewing is still done by a person. Beside it, a set of rules judges each day's recordings (one meeting code on one date) and says whether it would approve the day or hold it, for example because a recording is very short, two overlap, a class seems skipped, or the teacher seen on screen is not the scheduled one. A lecture cut by a break into several recordings is titled `... | Part 1`, `... | Part 2`. The teacher check reads each recording's name tile on this PC (ffmpeg and Windows OCR); frames and text are never kept or sent anywhere.

The rules change no job. Their verdicts are recorded, and the **Auto-review** page in the dashboard compares them with what staff then did, by meeting code and weekday, and shows the checklist that must be met before anything may run on its own. It is off unless `AUTO_REVIEW_MODE=dry_run` is set (and `AUTO_REVIEW_TEACHER=on` for the teacher check). See [docs/operations.md](docs/operations.md) and [issue #27](https://github.com/arahmanmdmajid/gdrive-youtube-sync/issues/27) for the plan.

Timetable slots can have a start day, so a class added later does not change earlier days.

## Repository layout

| Path | What it is |
|---|---|
| `artifacts/api-server` | Admin API (port 5000) + background worker |
| `artifacts/pipeline` | React/Vite app: admin dashboard, and the student portal when built with `VITE_APP_MODE=student` |
| `artifacts/student-api` | Student-facing API |
| `lib/db` | Drizzle schema and client shared by both APIs |
| `lib/api-zod`, `lib/api-client-react` | Request schemas and React Query hooks (hand-maintained) |
| `docs/` | Architecture, operations runbook, pipeline diagram, agent context |

## Quick start

Requires Node.js 24, pnpm (the version pinned in `package.json`) and PostgreSQL.

```bash
pnpm install
cp .env.example .env            # then fill it in
cd lib/db && pnpm run push && cd ../..       # create the tables
pnpm run build
pm2 start ecosystem.config.cjs  # or run the servers by hand — see SETUP.md
```

Dashboard: http://localhost:5173 · API: http://localhost:5000

Full installation, including how to obtain the Google OAuth tokens, is in **[SETUP.md](SETUP.md)**.

## Documentation

| Read | When |
|---|---|
| [SETUP.md](SETUP.md) | Installing on a new machine |
| [docs/operations.md](docs/operations.md) | Running it: daily jobs, flags, token expiry, troubleshooting, how to undo things, the review rules and their agreement report |
| [docs/architecture.md](docs/architecture.md) | How the code and data fit together |
| [docs/app-flow.html](docs/app-flow.html) | Interactive diagram of the pipeline and every route |
| [CLAUDE.md](CLAUDE.md) | Conventions and past decisions, written for AI coding agents |

## Development

```bash
pnpm run typecheck        # all packages (run `pnpm run typecheck:libs` first after changing lib/*)
```

Render and Vercel deploy from `main`, so a push to `main` updates the student side. The admin API runs locally and needs a rebuild and `pm2 restart dtt-api --update-env` to pick up changes.

---

*Hidayah Academy for Islamic Education · hidayah.edu.pk*
