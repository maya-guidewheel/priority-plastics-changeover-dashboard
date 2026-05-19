import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { apiFetch, clearAuth } from './utils/api'
import AuthGate from './auth/AuthGate'
import KPICards from './components/KPICards'
import OverviewTab from './components/tabs/OverviewTab'
import ChangeoverAnalysisTab from './components/tabs/ChangeoverAnalysisTab'
import MachineBreakdownTab from './components/tabs/MachineBreakdownTab'
import PVCCapacityTab from './components/tabs/PVCCapacityTab'
import DataAdminTab from './components/tabs/DataAdminTab'
import { computeKPIs } from './data/aggregations'
import type { ChangeoverEvent, FilterState, StatsRow } from './data/types'
import { getCalendarDate } from './utils/dates'

type Tab = 'overview' | 'analysis' | 'machines' | 'pvc-capacity' | 'admin'

interface DataStatus {
  changeovers: {
    count: number
    lastUpdated: string | null
    maxDate: string | null
    minDate: string | null
  }
  machine_stats: { count: number; lastUpdated: string | null }
}

interface ApiChangeoverEvent {
  start_dt: string
  end_dt: string
  duration: number
  machine: string
  shift: string
  status: string
  calendar_date: string
  week_start: string
  tags: string
  comments: string
}

const DEFAULT_FILTERS: FilterState = {
  dateFrom: '',
  dateTo: '',
  machines: [],
  changeoverTypeFilter: 'all',
  durationThreshold: 25,
  moldTarget: 30,
  bushingTarget: 90,
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'analysis', label: 'Changeover Analysis' },
  { id: 'machines', label: 'Machine Breakdown' },
  { id: 'pvc-capacity', label: 'PVC Capacity' },
  { id: 'admin', label: 'Data / Admin' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [allEvents, setAllEvents] = useState<ChangeoverEvent[]>([])
  const [statsRows, setStatsRows] = useState<StatsRow[]>([])
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)
  const [uploadFeedback, setUploadFeedback] = useState<{
    fileName: string
    rowsAdded: number
    duplicatesSkipped: number
    type: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [coRes, statsRes, statusRes] = await Promise.all([
        apiFetch('/api/data/changeovers'),
        apiFetch('/api/data/stats'),
        apiFetch('/api/status'),
      ])

      if (coRes.status === 401) {
        setLoading(false)
        return
      }

      if (!coRes.ok) throw new Error(`Server error (HTTP ${coRes.status})`)

      const coData = (await coRes.json()) as {
        events: ApiChangeoverEvent[]
      }
      const statusData = statusRes.ok
        ? ((await statusRes.json()) as DataStatus)
        : null

      const events: ChangeoverEvent[] = coData.events.map(e => ({
        ...e,
        start_dt: new Date(e.start_dt),
        end_dt: new Date(e.end_dt),
        inferred_type: 'bushing' as const,
      }))
      setAllEvents(events)
      setDataStatus(statusData)

      if (events.length > 0) {
        const dates = events.map(e => e.calendar_date).sort()
        setFilters(f => ({
          ...f,
          dateFrom: dates[0],
          dateTo: dates[dates.length - 1],
        }))
      }

      if (statsRes.ok) {
        const sData = (await statsRes.json()) as { rows: StatsRow[] }
        setStatsRows(sData.rows)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reach the server.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    function handle() {
      setAllEvents([])
      setDataStatus(null)
      setError('')
      setLoading(true)
      clearAuth()
    }
    window.addEventListener('auth:expired', handle)
    return () => window.removeEventListener('auth:expired', handle)
  }, [])

  const filtered = useMemo(() => {
    return allEvents.filter(e => {
      if (filters.dateFrom && e.calendar_date < filters.dateFrom) return false
      if (filters.dateTo && e.calendar_date > filters.dateTo) return false
      if (
        filters.machines.length > 0 &&
        !filters.machines.includes(e.machine)
      )
        return false
      const type =
        e.duration < filters.durationThreshold ? 'mold-only' : 'bushing'
      if (filters.changeoverTypeFilter === 'mold-only' && type !== 'mold-only')
        return false
      if (filters.changeoverTypeFilter === 'bushing' && type !== 'bushing')
        return false
      return true
    })
  }, [allEvents, filters])

  const kpis = useMemo(
    () => computeKPIs(filtered, filters),
    [filtered, filters]
  )

  const latestDataDate = dataStatus?.changeovers.maxDate ?? null

  const handleHeaderUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await apiFetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const d = (await res.json()) as { error?: string }
          throw new Error(d.error ?? 'Upload failed')
        }
        const result = (await res.json()) as typeof uploadFeedback
        setUploadFeedback(result)
        await loadAll()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [loadAll]
  )

  const today = getCalendarDate(new Date())
  const dataExceedsRange =
    !!filters.dateTo && !!latestDataDate && filters.dateTo > latestDataDate

  return (
    <AuthGate onLogin={loadAll}>
      <div className="min-h-screen" style={{ backgroundColor: '#f3f4f6' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{ backgroundColor: '#1e3a5f' }}>
          <div className="max-w-dashboard mx-auto px-6 flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div
                className="w-1.5 h-8 rounded-sm shrink-0"
                style={{ background: '#f97316' }}
              />
              <div>
                <div
                  className="text-[0.6rem] font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  Powered by Guidewheel
                </div>
                <h1 className="text-sm font-bold tracking-wide text-white leading-tight">
                  Priority Plastics — Changeover Dashboard
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {latestDataDate && (
                <span
                  className="text-xs hidden md:inline"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  Data through: <strong className="text-white">{latestDataDate}</strong>
                </span>
              )}
              <label
                className="text-white text-sm px-4 py-1.5 rounded cursor-pointer font-medium transition-opacity hover:opacity-90 whitespace-nowrap"
                style={{ backgroundColor: uploading ? '#4b5563' : '#f97316' }}
              >
                {uploading ? 'Uploading…' : '+ Upload CSV'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleHeaderUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Tab bar */}
          <div className="max-w-dashboard mx-auto px-6 flex items-end gap-0.5 overflow-x-auto">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap shrink-0"
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    borderBottom: isActive
                      ? '2px solid #f97316'
                      : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </header>

        {/* Upload feedback banner */}
        {uploadFeedback && (
          <div className="max-w-dashboard mx-auto px-4 sm:px-6 mt-3">
            <div
              className="flex items-center justify-between rounded-lg px-4 py-3 text-sm"
              style={{
                background: uploadFeedback.rowsAdded > 0 ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${uploadFeedback.rowsAdded > 0 ? '#bbf7d0' : '#fde68a'}`,
                color: uploadFeedback.rowsAdded > 0 ? '#166534' : '#92400e',
              }}
            >
              <div>
                <span className="font-semibold">{uploadFeedback.fileName}</span>
                {' — '}
                <span className="font-bold">
                  {uploadFeedback.rowsAdded.toLocaleString()} records added
                </span>
                {uploadFeedback.duplicatesSkipped > 0 && (
                  <span className="opacity-70">
                    , {uploadFeedback.duplicatesSkipped.toLocaleString()} duplicates skipped
                  </span>
                )}
              </div>
              <button
                onClick={() => setUploadFeedback(null)}
                className="ml-4 opacity-50 hover:opacity-100 font-bold text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Data range warning */}
        {dataExceedsRange && (
          <div className="max-w-dashboard mx-auto px-4 sm:px-6 mt-3">
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
              }}
            >
              Selected range extends beyond latest available data. Displayed values only reflect
              data loaded through <strong>{latestDataDate}</strong>.
            </div>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="max-w-dashboard mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="text-center py-24" style={{ color: '#6b7280' }}>
              <div className="text-lg font-medium">Loading data…</div>
            </div>
          ) : error && allEvents.length === 0 ? (
            <div
              className="rounded-lg px-4 py-3 text-sm mb-4"
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
              }}
            >
              {error}
            </div>
          ) : allEvents.length === 0 ? (
            <div className="text-center py-24">
              <p
                className="text-lg font-semibold mb-2"
                style={{ color: '#111827' }}
              >
                No changeover data loaded yet
              </p>
              <p className="text-sm mb-6" style={{ color: '#6b7280' }}>
                Drop CSV files from Guidewheel into the project folder and restart, or use the
                upload button above.
              </p>
              <button
                onClick={() => setActiveTab('admin')}
                className="text-sm font-medium px-6 py-2.5 rounded-lg text-white"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                Go to Data Upload
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="rounded-lg px-4 py-2 text-sm mb-4"
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                  }}
                >
                  {error}
                </div>
              )}

              {activeTab === 'overview' && (
                <>
                  <KPICards stats={kpis} />
                  <OverviewTab
                    events={filtered}
                    filters={filters}
                    latestDataDate={latestDataDate}
                  />
                </>
              )}

              {activeTab === 'analysis' && (
                <ChangeoverAnalysisTab
                  allEvents={allEvents}
                  filters={filters}
                  onFilterChange={setFilters}
                />
              )}

              {activeTab === 'machines' && (
                <MachineBreakdownTab events={filtered} filters={filters} />
              )}

              {activeTab === 'pvc-capacity' && (
                <PVCCapacityTab
                  events={allEvents}
                  statsRows={statsRows}
                  filters={filters}
                />
              )}

              {activeTab === 'admin' && (
                <DataAdminTab status={dataStatus} onUploadSuccess={loadAll} />
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer
          className="text-center py-4 text-xs"
          style={{ color: 'rgba(0,0,0,0.25)' }}
        >
          Priority Plastics Changeover Dashboard · Powered by Guidewheel ·{' '}
          {today}
        </footer>
      </div>
    </AuthGate>
  )
}
