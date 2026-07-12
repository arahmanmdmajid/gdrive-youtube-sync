# Drive-To-Tube — Setup Guide

Auto-uploads Google Drive class recordings to a YouTube playlist with correct titles, serial numbers, and schedule-based naming.

---

## Prerequisites

Install these before anything else:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| PostgreSQL | 15+ | https://www.postgresql.org/download/ |
| Git | any | https://git-scm.com |

---

## 1. Clone the repo

```bash
git clone https://github.com/arahmanmdmajid/gdrive-youtube-sync.git
cd gdrive-youtube-sync/Drive-To-Tube
```

---

## 2. Install dependencies

```bash
pnpm install
```

---

## 3. Create the database

Open pgAdmin or psql and run:

```sql
CREATE DATABASE drivetotube;
```

---

## 4. Create the `.env` file

Create a file named `.env` in the `Drive-To-Tube/` directory (next to `package.json`):

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drivetotube
PORT=5000

GOOGLE_OAUTH_CLIENT_ID=your_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret_here
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token_here
```

> **Where to get Google credentials:**
> 1. Go to [Google Cloud Console](https://console.cloud.google.com/) → your project
> 2. APIs & Services → Credentials → your OAuth 2.0 Client ID
> 3. Enable **Google Drive API** and **YouTube Data API v3**
> 4. To get a refresh token, run the OAuth flow once (see section 7 below)

---

## 5. Build the shared libraries

```bash
cd lib/db
npx tsc -p tsconfig.json
cd ../..
```

---

## 6. Run database migrations

```bash
cd artifacts/api-server
pnpm run db:push
cd ../..
```

---

## 7. Get a Google OAuth refresh token (first time only)

If you don't have a refresh token yet, or the existing one has expired (`invalid_grant` error):

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the settings gear (top right) → check **"Use your own OAuth credentials"**
3. Enter your Client ID and Client Secret
4. In Step 1, select scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/youtube`
5. Click **Authorize APIs** → sign in with the Google account that owns the Drive + YouTube channel
6. Click **Exchange authorization code for tokens**
7. Copy the **Refresh token** value → paste it into `.env` as `GOOGLE_OAUTH_REFRESH_TOKEN`

---

## 8. Start the servers

### Option A — PM2 (recommended, keeps servers alive)

```bash
# Install PM2 globally (one time)
npm install -g pm2 pm2-windows-startup

# Start both servers
pm2 start ecosystem.config.cjs

# Save so they restart on login
pm2 save
pm2-startup install    # Windows only
```

### Option B — Manual (for development)

**Terminal 1 — API server:**
```bash
cd artifacts/api-server
node --enable-source-maps --env-file=../../.env ./dist/index.mjs
```

> Build first if dist/ is missing:
> ```bash
> pnpm run build
> ```

**Terminal 2 — Frontend:**
```bash
cd artifacts/pipeline
pnpm run dev
```

---

## 9. Open the app

- **Dashboard**: http://localhost:5173
- **API**: http://localhost:5000

---

## PM2 quick reference

```bash
pm2 list                    # see status of both servers
pm2 logs dtt-api            # API server logs
pm2 logs dtt-frontend       # Frontend logs
pm2 restart all             # restart both
pm2 restart dtt-api         # restart just the API
pm2 stop all                # stop both
```

---

## Project structure

```
Drive-To-Tube/
├── .env                        # secrets — never commit this
├── ecosystem.config.cjs        # PM2 process config
├── artifacts/
│   ├── api-server/             # Express 5 API + pipeline worker
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── schedule.ts     # class schedule + title builder
│   │   │   │   ├── pipeline.ts     # Drive scan + slot assignment
│   │   │   │   └── googleAuth.ts   # OAuth2 singleton
│   │   │   └── routes/
│   │   │       └── jobs.ts         # job CRUD, approve, reject, restore
│   │   └── populate-playlist.mjs   # one-off: fills YouTube playlist from channel
│   └── pipeline/               # React 19 + Vite frontend (port 5173)
│       └── start.mjs           # Vite programmatic entry (used by PM2)
├── lib/
│   ├── db/                     # Drizzle ORM schema + client (@workspace/db)
│   └── api-client-react/       # Generated React Query hooks (@workspace/api-client-react)
└── scripts/
    └── cleanup-duplicates.mjs  # one-off: removes duplicate YouTube uploads
```

---

## Deployment plan (future)

See [DEPLOYMENT.md](DEPLOYMENT.md) once created. Recommended free stack:

| Layer | Service | Notes |
|---|---|---|
| Frontend | Vercel / Cloudflare Pages | Deploy `artifacts/pipeline` |
| API | Render (free web service) | Spins down after 15 min idle — cold start ~30s |
| Database | Neon (free PostgreSQL) | 0.5 GB, no expiry |

Set all `.env` values as environment variables in each platform's dashboard. The `.env` file is never deployed.

---

## Troubleshooting

**`invalid_grant` error when scanning**
→ The OAuth refresh token has expired. Re-run the OAuth flow (section 7) and update `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env`, then restart the API server.

**Port 5000 already in use**
→ Kill the old process: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force` (PowerShell)

**`lib/db` type errors after schema changes**
→ Rebuild: `cd lib/db && npx tsc -p tsconfig.json`

**Frontend shows "Component Preview Server"**
→ You started `artifacts/mockup-sandbox` instead of `artifacts/pipeline`. Use PM2 or start from the correct directory.
