import express, { type Request, type Response, type NextFunction } from 'express'
import Database from 'better-sqlite3'
import multer from 'multer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import rateLimit from 'express-rate-limit'
import compression from 'compression'
import { parseChangeoverCSV, parseStatsCSV } from './src/data/parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PORT = parseInt(process.env.PORT || '3001', 10)
const DB_PATH = process.env.DB_PATH || join(__dirname, 'priority-plastics.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS changeovers (
    row_hash      TEXT PRIMARY KEY,
    start_dt      TEXT NOT NULL,
    end_dt        TEXT NOT NULL,
    duration      REAL NOT NULL,
    machine       TEXT NOT NULL,
    shift         TEXT,
    status        TEXT,
    calendar_date TEXT NOT NULL,
    week_start    TEXT NOT NULL,
    tags          TEXT,
    comments      TEXT,
    ingested_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS machine_stats (
    row_hash    TEXT PRIMARY KEY,
    machine     TEXT NOT NULL,
    date        TEXT NOT NULL,
    avg_kw      REAL NOT NULL,
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ingestion_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name          TEXT NOT NULL,
    table_name         TEXT NOT NULL,
    rows_added         INTEGER NOT NULL,
    duplicates_skipped INTEGER NOT NULL,
    ingested_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const stmts = {
  insertChangeover: db.prepare(`
    INSERT OR IGNORE INTO changeovers
      (row_hash, start_dt, end_dt, duration, machine, shift, status,
       calendar_date, week_start, tags, comments)
    VALUES
      (@row_hash, @start_dt, @end_dt, @duration, @machine, @shift, @status,
       @calendar_date, @week_start, @tags, @comments)
  `),
  insertStats: db.prepare(`
    INSERT OR IGNORE INTO machine_stats (row_hash, machine, date, avg_kw)
    VALUES (@row_hash, @machine, @date, @avg_kw)
  `),
  logIngestion: db.prepare(`
    INSERT INTO ingestion_log (file_name, table_name, rows_added, duplicates_skipped)
    VALUES (@file_name, @table_name, @rows_added, @duplicates_skipped)
  `),
  getChangeovers: db.prepare('SELECT * FROM changeovers ORDER BY calendar_date, machine'),
  getStats: db.prepare('SELECT machine, date, avg_kw FROM machine_stats ORDER BY machine, date'),
  statsChangeovers: db.prepare(
    'SELECT COUNT(*) as n, MAX(ingested_at) as last, MAX(calendar_date) as max_date, MIN(calendar_date) as min_date FROM changeovers'
  ),
  statsStats: db.prepare('SELECT COUNT(*) as n, MAX(ingested_at) as last FROM machine_stats'),
  recentLog: db.prepare('SELECT * FROM ingestion_log ORDER BY id DESC LIMIT 20'),
}

function rowHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function hashFileName(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 12)
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

function ingestChangeovers(csvText: string, fileName: string) {
  const events = parseChangeoverCSV(csvText)
  let rowsAdded = 0
  let duplicatesSkipped = 0

  db.transaction(() => {
    for (const e of events) {
      const hash = rowHash(`${e.start_dt.toISOString()}|${e.machine}`)
      const r = stmts.insertChangeover.run({
        row_hash: hash,
        start_dt: e.start_dt.toISOString(),
        end_dt: e.end_dt.toISOString(),
        duration: e.duration,
        machine: e.machine,
        shift: e.shift || null,
        status: e.status || null,
        calendar_date: e.calendar_date,
        week_start: e.week_start,
        tags: e.tags || null,
        comments: e.comments || null,
      })
      r.changes > 0 ? rowsAdded++ : duplicatesSkipped++
    }
  })()

  stmts.logIngestion.run({
    file_name: hashFileName(fileName),
    table_name: 'changeovers',
    rows_added: rowsAdded,
    duplicates_skipped: duplicatesSkipped,
  })
  return { rowsAdded, duplicatesSkipped, total: events.length }
}

function ingestStats(csvText: string, fileName: string) {
  const rows = parseStatsCSV(csvText)
  let rowsAdded = 0
  let duplicatesSkipped = 0

  db.transaction(() => {
    for (const r of rows) {
      const hash = rowHash(`${r.machine}|${r.date}`)
      const result = stmts.insertStats.run({
        row_hash: hash,
        machine: r.machine,
        date: r.date,
        avg_kw: r.avg_kw,
      })
      result.changes > 0 ? rowsAdded++ : duplicatesSkipped++
    }
  })()

  stmts.logIngestion.run({
    file_name: hashFileName(fileName),
    table_name: 'machine_stats',
    rows_added: rowsAdded,
    duplicates_skipped: duplicatesSkipped,
  })
  return { rowsAdded, duplicatesSkipped, total: rows.length }
}

function runBackfill() {
  console.log('[backfill] scanning for seed CSV files...')
  let found = 0

  const scanDir = (dir: string, label: string) => {
    if (!existsSync(dir)) return
    const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'))
    for (const file of files) {
      try {
        const text = readFileSync(join(dir, file), 'utf-8')
        const lc = file.toLowerCase()
        const isStats = lc.includes('stats') || lc.includes('energy')
        const result = isStats
          ? ingestStats(text, file)
          : ingestChangeovers(text, file)
        console.log(
          `[backfill]   ${label}${file}: +${result.rowsAdded} added, ${result.duplicatesSkipped} skipped`
        )
        found++
      } catch (err) {
        console.error(`[backfill]   ERROR on ${label}${file}:`, err)
      }
    }
  }

  scanDir(__dirname, '')
  scanDir(join(__dirname, 'public', 'data'), 'public/data/')

  if (found === 0) {
    console.log('[backfill] no seed CSVs found — waiting for uploads via UI.')
  } else {
    console.log(`[backfill] done. Processed ${found} file(s).`)
  }
}

runBackfill()

// ── Express App ────────────────────────────────────────────────────────────
const app = express()
app.set('trust proxy', 1)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})
app.use(compression())
app.use(express.json())

// ── Auth Middleware ────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedUsername = process.env.PP_USERNAME
  const expectedPassword = process.env.PP_PASSWORD
  if (!expectedUsername || !expectedPassword) {
    res.status(500).json({ error: 'System error. Please try again in a moment.' })
    return
  }
  const header = req.headers.authorization
  if (!header?.startsWith('Basic ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  let decoded: string
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8')
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const colonIdx = decoded.indexOf(':')
  const user = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded
  const pass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : ''
  if (!safeCompare(user, expectedUsername) || !safeCompare(pass, expectedPassword)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

// ── Rate Limiters ──────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please wait a moment.' },
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes.' },
})

// ── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.sendStatus(200))

// ── Login Endpoint (granular error messages) ───────────────────────────────
app.post('/api/auth/login', loginLimiter, (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string }

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: 'Please enter both username and password.' })
    return
  }

  const expectedUsername = process.env.PP_USERNAME
  const expectedPassword = process.env.PP_PASSWORD

  if (!expectedUsername || !expectedPassword) {
    res.status(500).json({ error: 'System error. Please try again in a moment.' })
    return
  }

  if (!safeCompare(username.trim(), expectedUsername)) {
    res.status(401).json({ error: 'Username not recognized.' })
    return
  }

  if (!safeCompare(password, expectedPassword)) {
    res.status(401).json({ error: 'Incorrect password. Please try again.' })
    return
  }

  res.json({ ok: true })
})

// ── Apply auth + rate limiting to all /api/* (except login above) ──────────
app.use('/api', apiLimiter, requireAuth)

// ── API: Status ────────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const co = stmts.statsChangeovers.get() as {
    n: number
    last: string | null
    max_date: string | null
    min_date: string | null
  }
  const st = stmts.statsStats.get() as { n: number; last: string | null }
  res.json({
    changeovers: {
      count: co.n,
      lastUpdated: co.last,
      maxDate: co.max_date,
      minDate: co.min_date,
    },
    machine_stats: { count: st.n, lastUpdated: st.last },
  })
})

// ── API: Get Changeovers ───────────────────────────────────────────────────
app.get('/api/data/changeovers', (_req, res) => {
  const rows = stmts.getChangeovers.all() as Record<string, unknown>[]
  const events = rows.map(r => ({
    start_dt: r['start_dt'],
    end_dt: r['end_dt'],
    duration: r['duration'],
    machine: r['machine'],
    shift: r['shift'] || '',
    status: r['status'] || '',
    calendar_date: r['calendar_date'],
    week_start: r['week_start'],
    tags: r['tags'] || '',
    comments: r['comments'] || '',
  }))
  const stat = stmts.statsChangeovers.get() as {
    n: number
    last: string | null
    max_date: string | null
    min_date: string | null
  }
  res.json({
    events,
    total: events.length,
    lastUpdated: stat.last,
    maxDate: stat.max_date,
    minDate: stat.min_date,
  })
})

// ── API: Get Machine Stats ─────────────────────────────────────────────────
app.get('/api/data/stats', (_req, res) => {
  const rows = stmts.getStats.all()
  res.json({ rows, total: rows.length })
})

// ── API: Ingestion Log ─────────────────────────────────────────────────────
app.get('/api/ingestion-log', (_req, res) => {
  const log = stmts.recentLog.all()
  res.json({ log })
})

// ── API: Upload ────────────────────────────────────────────────────────────
app.post(
  '/api/upload',
  uploadLimiter,
  upload.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const csvText = req.file.buffer.toString('utf-8')
    const fileName = basename(req.file.originalname)
    const lc = fileName.toLowerCase()
    const isStats = lc.includes('stats') || lc.includes('energy')

    try {
      const result = isStats
        ? ingestStats(csvText, fileName)
        : ingestChangeovers(csvText, fileName)
      const type = isStats ? 'machine_stats' : 'changeovers'
      res.json({ ...result, type, fileName })
    } catch (err) {
      console.error('[upload] ingestion error:', err)
      res
        .status(500)
        .json({ error: 'Upload failed. Please check the file format and try again.' })
    }
  }
)

// ── Static Files (production build) ───────────────────────────────────────
const distPath = join(__dirname, 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on port ${PORT}`)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[server] database: ${DB_PATH}`)
  }
  if (!process.env.PP_USERNAME || !process.env.PP_PASSWORD) {
    console.warn(
      '[server] WARNING: PP_USERNAME or PP_PASSWORD not set — logins will fail'
    )
  }
})
