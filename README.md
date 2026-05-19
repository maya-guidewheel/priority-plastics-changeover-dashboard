# Priority Plastics Changeover Dashboard

A simple, highly visual dashboard for reviewing changeover performance at the Priority Plastics Portland plant — powered by Guidewheel data.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS + Recharts
- **Backend**: Express.js + better-sqlite3 (SQLite)
- **Deployment**: Railway (Docker)
- **File uploads**: Multer (server-side, in-memory parsing)
- **CSV parsing**: Papaparse

## Features

- **5 tabs**: Overview, Changeover Analysis, Machine Breakdown, PVC Capacity Context, Data / Admin
- **Changeover classification**: Duration-based mold-only vs. bushing-change candidates (editable threshold)
- **Green/red performance indicators**: Against editable per-type targets
- **Auto-ingestion**: CSVs placed in project root are auto-ingested on server start
- **Persistent data**: SQLite with Railway volume mount — survives redeploys
- **Deduplication**: Uploading the same file twice is safe
- **Username + password auth**: Granular error messages
- **Rate limiting**: Login, API, and upload endpoints
- **PVC Capacity tab**: Directional capacity context for PVC-capable machines

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env` file locally (do NOT commit it):

```
PP_USERNAME=admin
PP_PASSWORD=your-secure-password-here
DB_PATH=./priority-plastics.db
PORT=3001
```

On Railway, set these in the Variables panel — see below.

### 3. Add initial CSV data

Drop Guidewheel Issues CSV exports in the project root. They will be auto-ingested on server start.

Files containing "stats" or "energy" in the filename are ingested as machine stats for the PVC Capacity tab.

### 4. Build and start

```bash
npm run build
npm start
```

### 5. Development mode

```bash
# Terminal 1 — server
npm start

# Terminal 2 — frontend
npm run dev
```

## Railway Deployment

### Variables to set in Railway

| Variable | Value |
|----------|-------|
| `PP_USERNAME` | Your chosen login username |
| `PP_PASSWORD` | A strong password (20+ characters recommended) |
| `DB_PATH` | `/data/priority-plastics.db` (Railway persistent volume path) |
| `PORT` | Set automatically by Railway |

### Persistent volume

Mount a Railway volume at `/data` so the SQLite database survives redeploys.

1. In your Railway service, go to **Settings → Volumes**
2. Add volume, mount path: `/data`
3. Set `DB_PATH=/data/priority-plastics.db` in Variables

### Health check

Railway uses `/health` (returns 200) for orchestration. This endpoint is public.

## CSV File Formats

### Issues / Changeover CSV

Standard Guidewheel Issues export. Expected columns:
- `Start`, `End`, `Duration (minutes)`, `Devices`, `Status`, `Tags`, `Comments`

If any events have changeover-related tags (e.g., "changeover", "mold change", "bushing"), only those are imported. Otherwise all events are imported.

### Stats CSV

Guidewheel "All devices stats calculations" export. Semicolon-delimited with machine columns.

## Machine IDs

The dashboard normalizes Guidewheel device IDs to simple machine numbers. PVC-capable machines are: 1, 3, 4, 5, 7, 16, 18, 20.

## Changeover Logic

| Parameter | Default | Editable |
|-----------|---------|---------|
| Duration threshold (mold-only vs bushing) | 25 min | Yes — slider in Changeover Analysis tab |
| Mold-only target | 30 min | Yes — input in Changeover Analysis tab |
| Bushing target | 90 min | Yes — input in Changeover Analysis tab |

Green = at or under target. Red = over target.

## Security Notes

See `SECURITY_AND_PERFORMANCE_REVIEW.md` for the full checklist.

- Passwords are never sent to the frontend
- Server-side auth on all `/api/*` routes (except `/api/auth/login` which uses body credentials)
- Rate limiting on login (20/15min), API (120/min), uploads (10/min)
- Timing-safe credential comparison
- SQLite with parameterized queries (no SQL injection surface)
- `.env` files and CSV data excluded from git
