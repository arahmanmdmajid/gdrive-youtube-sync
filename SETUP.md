# Drive-To-Tube — Setup Guide

Installing the admin pipeline on a new machine. For what it is, see the [README](README.md); for running it day to day, [docs/operations.md](docs/operations.md).

The **student side is already hosted** (Render + Vercel, deploying from `main`), so a new machine only needs the admin API and dashboard.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 | https://nodejs.org |
| pnpm | the version in `package.json` (`packageManager`) | `corepack enable` picks it up; installing pnpm globally also works |
| PostgreSQL | 15+ | or a hosted database (we use Neon) — https://www.postgresql.org/download/ |
| Git | any | https://git-scm.com |

---

## 1. Clone and install

```bash
git clone https://github.com/arahmanmdmajid/gdrive-youtube-sync.git
cd gdrive-youtube-sync
pnpm install
```

---

## 2. Create the database

```sql
CREATE DATABASE drivetotube;
```

---

## 3. Create the `.env` file

```bash
cp .env.example .env
```

Fill in `.env` (next to `package.json`). `.env.example` documents every variable. The minimum to run the admin pipeline is:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drivetotube
PORT=5000
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...          # YouTube account — step 5
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=...    # Drive account — step 5 (optional if it is the same account)
```

The optional Meet-folder housekeeping variables (`DRIVE_CONSOLIDATE_*`, `DRIVE_CLEANUP_APPLY`) are explained in [docs/operations.md](docs/operations.md). The student API additionally needs `JWT_SECRET`; it is only required if you run `student-api` locally.

> **Google credentials:** in [Google Cloud Console](https://console.cloud.google.com/) → your project → *APIs & Services*: enable **Google Drive API** and **YouTube Data API v3**, and create an OAuth 2.0 Client ID (Credentials). Its ID and secret go in `.env`.

---

## 4. Create the tables

```bash
cd lib/db
pnpm run push
cd ../..
```

This creates every table from the schema in `lib/db/src/schema`. After a schema change, rebuild the library types with `pnpm run typecheck:libs` from the repo root. (`push-force` skips the confirmation prompt and is needed for destructive changes such as dropping a column.)

---

## 5. Get the Google OAuth refresh tokens

The pipeline uses **two Google accounts** that share one OAuth app:

| Token | Account | Scope |
|---|---|---|
| `GOOGLE_OAUTH_REFRESH_TOKEN` | the YouTube channel owner (uploads) | `https://www.googleapis.com/auth/youtube` |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | the account that owns the Meet recordings (reads and tidies Drive) | `https://www.googleapis.com/auth/drive` |

If both are the same account, leave the Drive one empty and the YouTube token is reused (the account then needs the `drive` scope as well).

For each token:

1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Settings gear → tick **Use your own OAuth credentials** → enter the Client ID and Secret. Access type **Offline**.
3. Under *Step 1*, enter the scope from the table (use the *Input your own scopes* box).
4. **Authorize APIs** and sign in as the right account. Use a private window and *Use another account* so you do not pick up the wrong one.
5. Click **Exchange authorization code for tokens** and copy the **Refresh token** (starts with `1//`) into `.env`.

While the OAuth app is in **Testing** (Google Cloud → *Google Auth Platform → Audience*), only listed test users can authorise, and **refresh tokens expire after about 7 days**. Add the second account as a test user, and publish the app (*Publish app*) so tokens stop expiring. Tokens minted *before* publishing keep the 7-day limit, so mint them after. The `drive` scope is a *restricted* scope; for a two-user app you simply stay unverified and click through the "unverified app" warning (*Advanced → Go to … (unsafe)*).

Do not remove the app's access at `myaccount.google.com/permissions` after minting — that revokes the token at once.

---

## 6. Build and start

```bash
pnpm run build
```

### Option A — PM2 (recommended, restarts on crash)

```bash
npm install -g pm2 pm2-windows-startup   # one time
pm2 start ecosystem.config.cjs
pm2 save
pm2-startup install                      # Windows: start on login
```

### Option B — manually

```bash
# Terminal 1 — API + worker
cd artifacts/api-server
node --enable-source-maps --env-file=../../.env ./dist/index.mjs

# Terminal 2 — dashboard
cd artifacts/pipeline
pnpm run dev
```

The API runs the **built** `dist/index.mjs`, so rebuild (`node build.mjs` in `artifacts/api-server`) before restarting after a code change.

Open the dashboard at http://localhost:5173 (API on http://localhost:5000). In **Settings**, add the Drive source folder(s) and choose the YouTube playlist; new top-level "Google Meet" folders are then registered automatically.

---

## PM2 quick reference

```bash
pm2 list                      # status
pm2 logs dtt-api              # API logs
pm2 restart dtt-api --update-env   # restart and re-read .env
pm2 stop all
```

---

## Project structure

```
.
├── .env                       # secrets — never commit (template: .env.example)
├── ecosystem.config.cjs       # PM2 config
├── artifacts/
│   ├── api-server/            # admin API + pipeline worker (port 5000)
│   ├── pipeline/              # React/Vite app: admin dashboard, and the student portal when VITE_APP_MODE=student
│   └── student-api/           # student API (hosted on Render)
├── lib/
│   ├── db/                    # Drizzle schema + client (@workspace/db)
│   ├── api-zod/               # request/response schemas
│   └── api-client-react/      # React Query hooks
└── docs/                      # architecture, operations, diagram, agent context
```

---

## Hosted deployment (what we run)

| Layer | Service | Notes |
|---|---|---|
| Student API (`student-api`) | Render | Auto-deploys from `main`; free tier sleeps when idle |
| Student portal (`pipeline`, student mode) | Vercel | Config in `artifacts/pipeline/vercel.json`; set `VITE_APP_MODE=student` and `VITE_API_URL` |
| Database | Neon PostgreSQL | Shared by both APIs |
| Admin API + dashboard | your own machine (PM2) | not public |

Set the environment variables in each platform's dashboard; `.env` is never deployed. Details in [docs/operations.md](docs/operations.md).

---

## Troubleshooting

**`invalid_grant` in the logs** → that refresh token has expired or been revoked. Mint a new one (step 5), update `.env`, then `pm2 restart dtt-api --update-env`. If it keeps happening weekly, publish the OAuth app.

**Port 5000 already in use** → `Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force` (PowerShell).

**Type errors after a schema change** → `pnpm run typecheck:libs` from the repo root.

**The scan finds nothing** → check the registered folders in Settings (`GET /api/drive-folders`) and that the Drive token belongs to the account that owns them.

More in [docs/operations.md](docs/operations.md).
