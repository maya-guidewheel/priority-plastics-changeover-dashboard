import { useMemo } from 'react'
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
} from '../../data/aggregations'
import { formatMinutes, formatDateTime } from '../../utils/dates'
import InfoTooltip from '../InfoTooltip'

interface Props {
  events: ChangeoverEvent[]
  filters: FilterState
  latestDataDate: string | null
}

export default function OverviewTab({ events, filters, latestDataDate }: Props) {
  const weeklyTrend = useMemo(
    () => computeWeeklyTrend(events, filters),
    [events, filters]
  )
  const machineSummaries = useMemo(
    () => computeMachineSummaries(events, filters),
    [events, filters]
  )

  const greenCount = useMemo(
    () => events.filter(e => isMeetingTarget(e, filters)).length,
    [events, filters]
  )
  const redCount = events.length - greenCount
  const pct = events.length > 0 ? Math.round((greenCount / events.length) * 100) : 0

  // Top 5 machines by avg duration
  const top5Machines = useMemo(
    () =>
      [...machineSummaries]
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 5)
        .map(m => ({ machine: `M${m.machine}`, avg: Math.round(m.avgDuration) })),
    [machineSummaries]
  )

  // Top 5 longest recent changeovers
  const top5Longest = useMemo(
    () =>
      [...events]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5),
    [events]
  )

  // For the reference line: use the bushing target (most common limiting factor)
  const refTarget = filters.bushingTarget

  if (events.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: '#6b7280' }}>
        No data for the selected filters. Try adjusting the date range or machine selection.
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Data coverage warning */}
      {latestDataDate && filters.dateTo > latestDataDate && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
        >
          Selected range extends beyond latest available data. Values only reflect data through{' '}
          <strong>{latestDataDate}</strong>.
        </div>
      )}

      {/* Target Attainment Summary */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Target Attainment Summary
          <InfoTooltip content="Green = changeover met its target time. Red = changeover exceeded target. Mold-only target: 30 min. Bushing target: 90 min." />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div
              className="text-4xl font-bold"
              style={{ color: pct >= 80 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#dc2626' }}
            >
              {pct}%
            </div>
            <div className="text-sm mt-1" style={{ color: '#6b7280' }}>
              meeting target
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: '#16a34a' }}>
              {greenCount}
            </div>
            <div className="text-sm mt-1" style={{ color: '#6b7280' }}>
              at or under target
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: '#dc2626' }}>
              {redCount}
            </div>
            <div className="text-sm mt-1" style={{ color: '#6b7280' }}>
              over target
            </div>
          </div>
        </div>
        <div className="mt-4 h-3 rounded-full overflow-hidden" style={{ background: '#fee2e2' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: pct >= 80 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#dc2626',
            }}
          />
        </div>
        <p className="pp-caption mt-2">
          {pct >= 80
            ? 'Strong target attainment. Focus on sustaining this performance.'
            : pct >= 60
              ? 'Moderate attainment. Review machines with the most time above target.'
              : 'Below 60% attainment. Prioritize the machines driving the most time above target.'}
        </p>
      </div>

      {/* Weekly Trend */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Changeover Duration Trend (Weekly Avg)
          <InfoTooltip content="Average changeover duration per week. The dashed line shows the bushing-change target. Weeks above the line are worth investigating." />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weeklyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={v => `${v}m`}
              label={{ value: 'Avg (min)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
            />
            <Tooltip
              formatter={(v: number) => [`${Math.round(v)} min`, 'Avg Duration']}
              labelFormatter={label => `Week of ${label}`}
            />
            <ReferenceLine
              y={refTarget}
              stroke="#f97316"
              strokeDasharray="4 2"
              label={{ value: `Target ${refTarget}m`, position: 'right', fontSize: 10, fill: '#f97316' }}
            />
            <Bar dataKey="avgDuration" radius={[3, 3, 0, 0]}>
              {weeklyTrend.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.avgDuration <= refTarget ? '#16a34a' : '#dc2626'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="pp-caption">
          Weeks shown in green are at or under the {refTarget}-minute bushing target. Red weeks exceeded the target on average.
        </p>
      </div>

      {/* Top 5 Machines */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Top 5 Machines by Average Changeover Duration
          <InfoTooltip content="Machines with the highest average changeover time. These are likely your biggest improvement opportunities." />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={top5Machines}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}m`} />
            <YAxis type="category" dataKey="machine" tick={{ fontSize: 12, fontWeight: 600 }} width={40} />
            <Tooltip formatter={(v: number) => [`${v} min`, 'Avg Duration']} />
            <Bar dataKey="avg" fill="#1e3a5f" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="pp-caption">
          Machines above target may represent setup, tooling, staffing, or process standardization opportunities.
        </p>
      </div>

      {/* Top 5 Longest Recent Changeovers */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Top 5 Longest Recent Changeovers
          <InfoTooltip content="The single longest changeover events. Worth reviewing individually to understand what happened." />
        </div>
        <div className="overflow-x-auto">
          <table className="pp-table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Machine</th>
                <th>Duration</th>
                <th>Type</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {top5Longest.map((e, i) => {
                const type = getInferredType(e.duration, filters.durationThreshold)
                const target = getTarget(type, filters)
                const met = e.duration <= target
                return (
                  <tr
                    key={i}
                    style={{ background: met ? '#f0fdf4' : '#fef2f2' }}
                  >
                    <td style={{ color: '#6b7280' }}>{formatDateTime(e.start_dt.toISOString())}</td>
                    <td className="font-semibold">M{e.machine}</td>
                    <td className="font-bold tabular-nums" style={{ color: met ? '#16a34a' : '#dc2626' }}>
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
                        {met ? '✓ On target' : '✗ Over target'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="pp-caption">
          These are the longest individual changeovers. Investigate the specific events to understand root causes.
        </p>
      </div>

    </div>
  )
}
