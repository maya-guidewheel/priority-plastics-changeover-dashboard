import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts'
import type { ChangeoverEvent, FilterState } from '../../data/types'
import {
  computeMachineSummaries,
  computeWeeklyTrend,
  getInferredType,
  getTarget,
} from '../../data/aggregations'
import { formatMinutes, formatDateTime } from '../../utils/dates'
import InfoTooltip from '../InfoTooltip'

interface Props {
  events: ChangeoverEvent[]
  filters: FilterState
}

type SortKey = 'machine' | 'count' | 'avg' | 'pct' | 'above'
type SortDir = 'asc' | 'desc'

export default function MachineBreakdownTab({ events, filters }: Props) {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('above')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const summaries = useMemo(
    () => computeMachineSummaries(events, filters),
    [events, filters]
  )

  const sorted = useMemo(() => {
    return [...summaries].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'machine') {
        const na = parseInt(a.machine) || 9999
        const nb = parseInt(b.machine) || 9999
        cmp = na - nb
      } else if (sortKey === 'count') cmp = a.totalChangeovers - b.totalChangeovers
      else if (sortKey === 'avg') cmp = a.avgDuration - b.avgDuration
      else if (sortKey === 'pct') cmp = a.pctMeetingTarget - b.pctMeetingTarget
      else if (sortKey === 'above') cmp = a.totalAboveTarget - b.totalAboveTarget
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [summaries, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  // Machine detail view
  const detailEvents = useMemo(
    () => (selectedMachine ? events.filter(e => e.machine === selectedMachine) : []),
    [events, selectedMachine]
  )

  const detailTrend = useMemo(
    () =>
      selectedMachine
        ? computeWeeklyTrend(detailEvents, filters)
        : [],
    [detailEvents, filters, selectedMachine]
  )

  const detailSorted = useMemo(
    () => [...detailEvents].sort((a, b) => b.start_dt.getTime() - a.start_dt.getTime()),
    [detailEvents]
  )

  const avgChartData = useMemo(
    () =>
      summaries.map(m => ({
        machine: `M${m.machine}`,
        avg: Math.round(m.avgDuration),
        above: Math.round(m.totalAboveTarget),
        pct: Math.round(m.pctMeetingTarget),
      })),
    [summaries]
  )

  if (events.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: '#6b7280' }}>
        No data for the selected filters.
      </div>
    )
  }

  const chartHeight = Math.max(200, summaries.length * 32)

  return (
    <div className="space-y-5">

      {/* Avg Duration Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="pp-card p-5">
          <div className="pp-section-title">
            Avg Duration by Machine
            <InfoTooltip content="Average changeover duration per machine. Longer bars = more opportunity." />
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={avgChartData}
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
              <Tooltip formatter={(v: number) => [`${v} min`, 'Avg Duration']} />
              <ReferenceLine
                x={filters.bushingTarget}
                stroke="#f97316"
                strokeDasharray="4 2"
                label={{ value: `${filters.bushingTarget}m`, position: 'top', fontSize: 10, fill: '#f97316' }}
              />
              <Bar dataKey="avg" radius={[0, 3, 3, 0]}>
                {avgChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.avg <= filters.bushingTarget ? '#16a34a' : '#dc2626'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pp-card p-5">
          <div className="pp-section-title">
            Total Time Above Target by Machine
            <InfoTooltip content="Total minutes above target across all changeovers for each machine. This is the recoverable time per machine." />
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={avgChartData}
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
              <Bar dataKey="above" fill="#dc2626" fillOpacity={0.8} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Machine summary table */}
      <div className="pp-card p-5">
        <div className="pp-section-title">Machine Summary — Click a Row to Drill Down</div>
        <div className="overflow-x-auto">
          <table className="pp-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('machine')}>
                  Machine {sortKey === 'machine' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('count')}>
                  Changeovers {sortKey === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('avg')}>
                  Avg {sortKey === 'avg' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Median</th>
                <th>Longest</th>
                <th onClick={() => toggleSort('pct')}>
                  % On Target {sortKey === 'pct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('above')}>
                  Time Above Target {sortKey === 'above' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Bushing</th>
                <th>Mold-Only</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const isSelected = selectedMachine === m.machine
                return (
                  <tr
                    key={m.machine}
                    onClick={() => setSelectedMachine(isSelected ? null : m.machine)}
                    className="cursor-pointer"
                    style={{
                      background: isSelected
                        ? '#dbeafe'
                        : m.pctMeetingTarget >= 80
                          ? '#f0fdf4'
                          : m.pctMeetingTarget >= 60
                            ? '#fffbeb'
                            : '#fef2f2',
                    }}
                  >
                    <td className="font-bold">M{m.machine}</td>
                    <td className="tabular-nums">{m.totalChangeovers}</td>
                    <td
                      className="tabular-nums font-semibold"
                      style={{ color: m.avgDuration > filters.bushingTarget ? '#dc2626' : '#16a34a' }}
                    >
                      {formatMinutes(m.avgDuration)}
                    </td>
                    <td className="tabular-nums">{formatMinutes(m.medianDuration)}</td>
                    <td className="tabular-nums">{formatMinutes(m.longestDuration)}</td>
                    <td>
                      <span
                        className={m.pctMeetingTarget >= 80 ? 'pp-badge-green' : 'pp-badge-red'}
                      >
                        {Math.round(m.pctMeetingTarget)}%
                      </span>
                    </td>
                    <td
                      className="tabular-nums font-semibold"
                      style={{ color: m.totalAboveTarget > 0 ? '#dc2626' : '#16a34a' }}
                    >
                      {formatMinutes(m.totalAboveTarget)}
                    </td>
                    <td className="tabular-nums">{m.bushingCount}</td>
                    <td className="tabular-nums">{m.moldOnlyCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Machine detail drilldown */}
      {selectedMachine && detailEvents.length > 0 && (
        <div
          className="pp-card p-5"
          style={{ borderColor: '#3b82f6', borderWidth: 2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="pp-section-title mb-0">
              Machine {selectedMachine} — Detail
            </div>
            <button
              onClick={() => setSelectedMachine(null)}
              className="text-sm px-3 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
            >
              Close
            </button>
          </div>

          {/* Trend for this machine */}
          {detailTrend.length > 1 && (
            <div className="mb-5">
              <div className="text-sm font-semibold mb-2" style={{ color: '#374151' }}>
                Duration Trend (Weekly Avg)
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={detailTrend} margin={{ top: 5, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}m`} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v)} min`, 'Avg Duration']} />
                  <ReferenceLine
                    y={filters.bushingTarget}
                    stroke="#f97316"
                    strokeDasharray="4 2"
                  />
                  <Line
                    type="monotone"
                    dataKey="avgDuration"
                    stroke="#1e3a5f"
                    strokeWidth={2}
                    dot={{ fill: '#1e3a5f', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Event table for machine */}
          <div className="text-sm font-semibold mb-2" style={{ color: '#374151' }}>
            All Changeovers ({detailEvents.length})
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Duration</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detailSorted.slice(0, 50).map((e, i) => {
                  const type = getInferredType(e.duration, filters.durationThreshold)
                  const target = getTarget(type, filters)
                  const met = e.duration <= target
                  return (
                    <tr key={i} style={{ background: met ? '#f0fdf4' : '#fef2f2' }}>
                      <td style={{ color: '#6b7280' }}>{formatDateTime(e.start_dt.toISOString())}</td>
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
                      <td style={{ color: '#6b7280' }}>{formatMinutes(target)}</td>
                      <td>
                        <span className={met ? 'pp-badge-green' : 'pp-badge-red'}>
                          {met ? '✓' : '✗ Over'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {detailEvents.length > 50 && (
            <p className="pp-caption">Showing 50 most recent of {detailEvents.length} events.</p>
          )}
        </div>
      )}

    </div>
  )
}
