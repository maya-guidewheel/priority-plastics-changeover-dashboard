# Security & Performance Review — Priority Plastics Dashboard

Last reviewed: 2026-05-13

## Authentication

- [x] Username + password stored only as Railway environment variables (`PP_USERNAME`, `PP_PASSWORD`)
- [x] Login uses POST `/api/auth/login` with body params — credentials never appear in URL or headers before validation
- [x] Server uses timing-safe comparison (`timingSafeEqual`) to prevent timing attacks
- [x] Client stores a Basic auth token (`btoa(user:pass)`) in localStorage with 12-hour expiry
- [x] All `/api/*` routes (except login) protected by `requireAuth` middleware
- [x] 401 response on any unauthenticated API request
- [x] Login rate limited: 20 attempts per 15 minutes
- [x] Token expiry checked every 60 seconds client-side
- [x] `auth:expired` event clears state and redirects to login

## Error Messages (Verified)

- Missing username or password: **"Please enter both username and password."**
- Incorrect username: **"Username not recognized."**
- Incorrect password: **"Incorrect password. Please try again."**
- Server misconfiguration (env vars not set): **"System error. Please try again in a moment."**
- Network error: **"Could not connect to the server. Please check your network."**
- Rate limited: **"Too many login attempts. Please wait a few minutes and try again."**
- Generic fallback: **"Unable to log in. Please try again."**

## Secrets / Sensitive Data

- [x] `PP_USERNAME` and `PP_PASSWORD` are server-side only — never referenced in Vite source
- [x] `.gitignore` excludes `.env`, `*.db`, `*.csv`, `node_modules/`, `dist/`
- [x] No secrets in `index.html`, frontend bundle, or API responses
- [x] Health check (`/health`) returns 200 only — no sensitive data

## Input Validation & Injection

- [x] SQLite parameterized queries everywhere (`db.prepare()` with named parameters)
- [x] No string interpolation in SQL
- [x] CSV ingestion uses `INSERT OR IGNORE` with hash-based deduplication
- [x] File upload size limited to 20 MB (Multer)
- [x] File upload type restricted to `.csv`
- [x] BOM characters stripped from CSV before parsing
- [x] Duration field validated: must be numeric, > 0, < 720 minutes
- [x] "Ongoing" duration strings skipped

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST `/api/auth/login` | 20 req / 15 min |
| All `/api/*` | 120 req / 60 sec |
| POST `/api/upload` | 10 req / 60 sec |

- [x] `trust proxy: 1` set so Railway's proxy passes real client IP
- [x] Rate limit responses return `{ error: "..." }` JSON

## Data Persistence

- [x] SQLite database path set via `DB_PATH` env var
- [x] Railway volume should be mounted at `/data`; `DB_PATH=/data/priority-plastics.db`
- [x] WAL journal mode enabled for concurrent read safety
- [x] `mkdirSync` ensures the DB directory exists on startup
- [x] Backfill runs at startup — idempotent due to `INSERT OR IGNORE`

## Frontend Security

- [x] No `dangerouslySetInnerHTML` used
- [x] No external script sources
- [x] Tooltips use React state, not innerHTML
- [x] `novalidate` omitted — native form validation still works for required fields

## Performance

- [x] `useMemo` used for all expensive derived data (KPIs, machine summaries, weekly trends)
- [x] Filtered events computed once and passed to child components
- [x] Charts use `ResponsiveContainer` from Recharts (no reflow issues)
- [x] Table limited to 100 rows by default with clear messaging
- [x] Compression middleware enabled on Express (`compression`)
- [x] Loading state shown during initial data fetch

## No Energy Tab

- [x] Energy tab is explicitly out of scope for this dashboard
- [x] No energy tables, no energy routes, no energy components

## Pre-Production Checklist

Before going live, verify:

- [ ] `PP_USERNAME` and `PP_PASSWORD` are set in Railway Variables
- [ ] `DB_PATH` is set to `/data/priority-plastics.db`
- [ ] Railway volume is mounted at `/data`
- [ ] Initial CSV files have been uploaded and data is visible
- [ ] Login error messages behave as expected
- [ ] Duplicate CSV upload does not double-count records
- [ ] Date range warning appears when selected range exceeds data
- [ ] All machine labels are visible in charts
- [ ] PVC machines (1, 3, 4, 5, 7, 16, 18, 20) are correctly highlighted
- [ ] No console errors in production build
- [ ] Health check returns 200: `curl https://your-railway-url/health`

## Threat Model Notes

This is a low-risk internal business dashboard accessible via password. Main risks:
1. **Credential exposure**: Mitigated by env vars + timing-safe comparison
2. **Unauthorized data access**: Mitigated by server-side auth on all data routes
3. **Data injection via CSV**: Mitigated by parameterized queries and duration validation
4. **Brute force login**: Mitigated by rate limiting

The username enumeration from granular error messages (username vs. password wrong) is a known trade-off, explicitly chosen for this single-tenant dashboard where the username is not sensitive.
