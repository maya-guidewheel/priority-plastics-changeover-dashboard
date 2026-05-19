import type { KPIStats } from '../data/types'
import { formatMinutes } from '../utils/dates'
import InfoTooltip from './InfoTooltip'

interface CardProps {
  label: string
  value: string
  sub?: string
  color?: string
  tooltip?: string
}

function KPICard({ label, value, sub, color, tooltip }: CardProps) {
  return (
    <div className="pp-card p-4 flex flex-col gap-1 min-w-0">
      <div
        className="flex items-center text-xs font-semibold uppercase tracking-wider"
        style={{ color: '#6b7280' }}
      >
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      <div
        className="text-2xl font-bold leading-tight tabular-nums truncate"
        style={{ color: color ?? '#111827' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: '#9ca3af' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function KPICards({ stats }: { stats: KPIStats }) {
  const pctColor =
    stats.pctMeetingTarget >= 80
      ? '#16a34a'
      : stats.pctMeetingTarget >= 60
        ? '#f59e0b'
        : '#dc2626'

  const empty = stats.totalChangeovers === 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <KPICard
        label="Total Changeovers"
        value={stats.totalChangeovers.toLocaleString()}
        sub="in selected period"
        tooltip="Total changeover events matching your current filters."
      />
      <KPICard
        label="Avg Duration"
        value={empty ? '—' : formatMinutes(stats.avgDuration)}
        sub={empty ? undefined : `Median: ${formatMinutes(stats.medianDuration)}`}
        tooltip="Average changeover duration. Median is less affected by outliers."
      />
      <KPICard
        label="% Meeting Target"
        value={empty ? '—' : `${Math.round(stats.pctMeetingTarget)}%`}
        sub={empty ? undefined : `${stats.redCount} over target`}
        color={empty ? '#9ca3af' : pctColor}
        tooltip="Percentage of changeovers that finished within their target. Mold-only target: 30 min. Bushing target: 90 min. Both targets are editable in Changeover Analysis."
      />
      <KPICard
        label="Time Above Target"
        value={empty ? '—' : formatMinutes(stats.totalAboveTarget)}
        sub="total minutes over target"
        color={
          empty
            ? '#9ca3af'
            : stats.totalAboveTarget > 0
              ? '#dc2626'
              : '#16a34a'
        }
        tooltip="Total minutes spent above target across all changeovers. This is the recoverable time — if every changeover hit its target, this is how many minutes would be saved."
      />
      <KPICard
        label="Longest Changeover"
        value={empty ? '—' : formatMinutes(stats.longestDuration)}
        tooltip="The single longest changeover event in the selected period."
      />
      <KPICard
        label="Highest Avg Machine"
        value={stats.worstMachine !== '—' ? `Machine ${stats.worstMachine}` : '—'}
        sub="by average duration"
        tooltip="Machine with the highest average changeover duration. A good place to start for improvement."
      />
      <KPICard
        label="Over Target"
        value={stats.redCount.toLocaleString()}
        sub="changeovers"
        color={stats.redCount > 0 ? '#dc2626' : '#16a34a'}
        tooltip="Number of individual changeovers that exceeded their target duration."
      />
      <KPICard
        label="At or Under Target"
        value={(stats.totalChangeovers - stats.redCount).toLocaleString()}
        sub="changeovers"
        color={
          stats.totalChangeovers - stats.redCount > 0 ? '#16a34a' : '#9ca3af'
        }
        tooltip="Number of changeovers completed at or below their target."
      />
    </div>
  )
}
