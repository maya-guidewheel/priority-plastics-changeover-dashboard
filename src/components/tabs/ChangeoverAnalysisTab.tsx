import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { ChangeoverEvent, FilterState } from '../../data/types'
import {
  computeWeeklyTrend,
  computeMachineSummaries,
  isMeetingTarget,
  getInferredType,
  getTarget,
  timeAboveTarget,
  getUniqueMachines,
} from '../../data/aggregations'
import { formatMinutes, formatDateTime } from '../../utils/dates'
import InfoTooltip from '../InfoTooltip'

interface Props {
  allEvents: ChangeoverEvent[]
  filters: FilterState
  onFilterChange: (f: FilterState) => void
}

type SortKey = 'date' | 'machine' | 'duration' | 'type' | 'status'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 100

export default function ChangeoverAnalysisTab({ allEvents, filters, onFilterChange }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showMachineDropdown, setShowMachineDropdown] = useState(false)

  const allMachines = useMemo(() => getUniqueMachines(allEvents), [allEvents])

  // Apply date + machine + type filters
  const filtered = useMemo(() => {
    return allEvents.filter(e => {
      if (filters.dateFrom && e.calendar_date < filters.dateFrom) return false
      if (filters.dateTo && e.calendar_date > filters.dateTo) return false
      if (filters.machines.length > 0 && !filters.machines.includes(e.machine)) return false
      const type = getInferredType(e.duration, filters.durationThreshold)
      if (filters.changeoverTypeFilter === 'mold-only' && type !== 'mold-only') return false
      if (filters.changeoverTypeFilter === 'bushing' && type !== 'bushing') return false
      return true
    })
  }, [allEvents, filters])

  const weeklyTrend = useMemo(() => computeWeeklyTrend(filtered, filters), [filtered, filters])
  const machineSummaries = useMemo(() => computeMachineSummaries(filtered, filters), [filtered, filters])

  const greenCount = useMemo(
    () => filtered.filter(e => isMeetingTarget(e, filters)).length,
    [filtered, filters]
  )
  const redCount = filtered.length - greenCount
  const pct = filtered.length > 0 ? Math.round((greenCount / filtered.length) * 100) : 0
  const avgDuration =
    filtered.length > 0
      ? filtered.reduce((s, e) => s + e.duration, 0) / filtered.length
      : 0
  const totalAbove = filtered.reduce((s, e) => s + timeAboveTarget(e, filters), 0)

  // Sorted table
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = a.start_dt.getTime() - b.start_dt.getTime()
      else if (sortKey === 'machine') cmp = parseInt(a.machine) - parseInt(b.machine) || a.machine.localeCompare(b.machine)
      else if (sortKey === 'duration') cmp = a.duration - b.duration
      else if (sortKey === 'type') cmp = getInferredType(a.duration, filters.durationThreshold).localeCompare(getInferredType(b.duration, filters.durationThreshold))
      else if (sortKey === 'status') {
        const am = isMeetingTarget(a, filters) ? 1 : 0
        const bm = isMeetingTarget(b, filters) ? 1 : 0
        cmp = am - bm
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir, filters])

  const displayed = sorted.slice(0, PAGE_SIZE)

  // Pareto: machines sorted by total time above target
  const paretoData = useMemo(
    () =>
      machineSummaries
        .filter(m => m.totalAboveTarget > 0)
        .sort((a, b) => b.totalAboveTarget - a.totalAboveTarget)
        .slice(0, 10)
        .map(m => ({ machine: `M${m.machine}`, totalAbove: Math.round(m.totalAboveTarget) })),
    [machineSummaries]
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function toggleMachine(m: string) {
    const cur = filters.machines
    onFilterChange({
      ...filters,
      machines: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m],
    })
  }

  function clearFilters() {
    if (allEvents.length > 0) {
      const dates = allEvents.map(e => e.calendar_date).sort()
      onFilterChange({
        ...filters,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        machines: [],
        changeoverTypeFilter: 'all',
      })
    }
  }

  const hasActiveFilters =
    filters.machines.length > 0 || filters.changeoverTypeFilter !== 'all'

  // Mixed-type events: choose a blended target reference for the trend chart
  const trendTarget =
    filters.changeoverTypeFilter === 'mold-only'
      ? filters.moldTarget
      : filters.bushingTarget

  return (
    <div className="space-y-5">

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="pp-card p-5">
        <div className="pp-section-title">Filters</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Date range */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Date From
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => onFilterChange({ ...filters, dateFrom: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Date To
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => onFilterChange({ ...filters, dateTo: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>

          {/* Machine select */}
          <div className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Machines
              <InfoTooltip content="Select one or more machines to filter. Leave empty to show all." />
            </label>
            <button
              onClick={() => setShowMachineDropdown(v => !v)}
              className="w-full border rounded px-2 py-1.5 text-sm text-left"
              style={{ borderColor: '#e5e7eb', color: '#111827' }}
            >
              {filters.machines.length === 0
                ? 'All machines'
                : `${filters.machines.length} selected`}
            </button>
            {showMachineDropdown && (
              <div
                className="absolute top-full left-0 mt-1 z-20 pp-card shadow-lg p-2 min-w-[160px] max-h-48 overflow-y-auto"
                onBlur={() => setShowMachineDropdown(false)}
              >
                {allMachines.map(m => (
                  <label
                    key={m}
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={filters.machines.includes(m)}
                      onChange={() => toggleMachine(m)}
                      className="rounded"
                    />
                    Machine {m}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Type filter */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Changeover Type
              <InfoTooltip content="Duration-based classification. Short changeovers (under threshold) are mold-only candidates. Longer ones are bushing candidates. Not apples-to-apples." />
            </label>
            <select
              value={filters.changeoverTypeFilter}
              onChange={e =>
                onFilterChange({
                  ...filters,
                  changeoverTypeFilter: e.target.value as FilterState['changeoverTypeFilter'],
                })
              }
              className="w-full border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: '#e5e7eb' }}
            >
              <option value="all">All changeovers</option>
              <option value="mold-only">Mold-only candidates (&lt; {filters.durationThreshold}m)</option>
              <option value="bushing">Bushing candidates (≥ {filters.durationThreshold}m)</option>
            </select>
          </div>

          {/* Threshold */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Duration Threshold: <strong>{filters.durationThreshold} min</strong>
              <InfoTooltip content="The duration threshold helps separate short mold-only changes from longer bushing-related changes. Adjust to match your operation." />
            </label>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={filters.durationThreshold}
              onChange={e =>
                onFilterChange({ ...filters, durationThreshold: parseInt(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
              <span>5m</span>
              <span>60m</span>
            </div>
          </div>

          {/* Mold target */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Mold-Only Target (min)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={filters.moldTarget}
              onChange={e =>
                onFilterChange({ ...filters, moldTarget: parseInt(e.target.value) || 30 })
              }
              className="w-full border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>

          {/* Bushing target */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
              Bushing Target (min)
            </label>
            <input
              type="number"
              min={15}
              max={300}
              value={filters.bushingTarget}
              onChange={e =>
                onFilterChange({ ...filters, bushingTarget: parseInt(e.target.value) || 90 })
              }
              className="w-full border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>

          {/* Clear */}
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="px-4 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-40"
              style={{ borderColor: '#e5e7eb', color: '#374151' }}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-3">
            {filters.machines.map(m => (
              <button key={m} className="pp-filter-chip" onClick={() => toggleMachine(m)}>
                Machine {m} ×
              </button>
            ))}
            {filters.changeoverTypeFilter !== 'all' && (
              <button
                className="pp-filter-chip"
                onClick={() => onFilterChange({ ...filters, changeoverTypeFilter: 'all' })}
              >
                {filters.changeoverTypeFilter === 'mold-only' ? 'Mold-only' : 'Bushing'} ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Section A: Target Performance ──────────────────────────────── */}
      <div className="pp-card p-5">
        <div className="pp-section-title">Target Performance</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg" style={{ background: '#f0fdf4' }}>
            <div className="text-3xl font-bold" style={{ color: '#16a34a' }}>{greenCount}</div>
            <div className="text-xs mt-1 font-medium" style={{ color: '#16a34a' }}>Met Target ({pct}%)</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: '#fef2f2' }}>
            <div className="text-3xl font-bold" style={{ color: '#dc2626' }}>{redCount}</div>
            <div className="text-xs mt-1 font-medium" style={{ color: '#dc2626' }}>Over Target</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: '#f3f4f6' }}>
            <div className="text-xl font-bold" style={{ color: '#111827' }}>{formatMinutes(avgDuration)}</div>
            <div className="text-xs mt-1" style={{ color: '#6b7280' }}>Avg Duration</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: '#fef2f2' }}>
            <div className="text-xl font-bold" style={{ color: '#dc2626' }}>{formatMinutes(totalAbove)}</div>
            <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
              Total Above Target
              <InfoTooltip content="Time above target shows how many minutes were lost beyond the expected changeover target." />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section B: Trend ────────────────────────────────────────────── */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Changeover Duration Trend
          <InfoTooltip content="Average changeover duration per week for filtered events. The reference line shows the relevant target." />
        </div>
        {weeklyTrend.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyTrend} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}m`} />
                <Tooltip
                  formatter={(v: number) => [`${Math.round(v)} min`, 'Avg Duration']}
                  labelFormatter={l => `Week of ${l}`}
                />
                <ReferenceLine
                  y={trendTarget}
                  stroke="#f97316"
                  strokeDasharray="4 2"
                  label={{ value: `${trendTarget}m target`, position: 'right', fontSize: 10, fill: '#f97316' }}
                />
                <Bar dataKey="avgDuration" radius={[3, 3, 0, 0]}>
                  {weeklyTrend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.avgDuration <= trendTarget ? '#16a34a' : '#dc2626'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="pp-caption">
              Each bar is the average changeover duration for that week. Green = at or under target. Red = above target.
            </p>
          </>
        ) : (
          <div className="text-center py-10" style={{ color: '#9ca3af' }}>
            No data for selected filters.
          </div>
        )}
      </div>

      {/* ── Section C: Changeover List ──────────────────────────────────── */}
      <div className="pp-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="pp-section-title mb-0">
            Changeover List
            <InfoTooltip content="All changeovers matching your filters. Click column headers to sort. Rows are color-coded: green = met target, red = over target." />
          </div>
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            Showing {displayed.length} of {filtered.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="pp-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('date')}>
                  Date / Time {sortKey === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('machine')}>
                  Machine {sortKey === 'machine' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('duration')}>
                  Duration {sortKey === 'duration' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('type')}>
                  Type {sortKey === 'type' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Target</th>
                <th onClick={() => toggleSort('status')}>
                  Status {sortKey === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((e, i) => {
                const type = getInferredType(e.duration, filters.durationThreshold)
                const target = getTarget(type, filters)
                const met = e.duration <= target
                return (
                  <tr key={i} style={{ background: met ? '#f0fdf4' : '#fef2f2' }}>
                    <td style={{ color: '#6b7280' }}>{formatDateTime(e.start_dt.toISOString())}</td>
                    <td className="font-semibold">M{e.machine}</td>
                    <td
                      className="font-bold tabular-nums"
                      style={{ color: met ? '#16a34a' : '#dc2626' }}
                    >
                      {formatMinutes(e.duration)}
                    </td>
                    <td>
                      <span className={type === 'mold-only' ? 'pp-badge-green' : 'pp-badge-red'}>
                        {type === 'mold-only' ? 'Mold-only' : 'Bushing'}
                      </span>
                    </td>
                    <td className="tabular-nums" style={{ color: '#6b7280' }}>
                      {formatMinutes(target)}
                    </td>
                    <td>
                      <span className={met ? 'pp-badge-green' : 'pp-badge-red'}>
                        {met ? '✓ On target' : '✗ Over'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8" style={{ color: '#9ca3af' }}>
                    No changeovers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE && (
          <p className="pp-caption mt-2">
            Showing first {PAGE_SIZE} of {filtered.length} records. Narrow the date range or machine filter to see more.
          </p>
        )}
      </div>

      {/* ── Section D: Pareto ───────────────────────────────────────────── */}
      {paretoData.length > 0 && (
        <div className="pp-card p-5">
          <div className="pp-section-title">
            Opportunity View: Time Above Target by Machine
            <InfoTooltip content="Start with the machines creating the most time above target, not just the machines with the most events." />
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, paretoData.length * 36)}>
            <BarChart
              data={paretoData}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}m`} />
              <YAxis
                type="category"
                dataKey="machine"
                tick={{ fontSize: 12, fontWeight: 600 }}
                width={40}
              />
              <Tooltip formatter={(v: number) => [`${v} min`, 'Total Above Target']} />
              <Bar dataKey="totalAbove" fill="#dc2626" fillOpacity={0.8} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="pp-caption">
            Start with the machines creating the most time above target, not just the machines with the most events.
          </p>
        </div>
      )}

    </div>
  )
}
