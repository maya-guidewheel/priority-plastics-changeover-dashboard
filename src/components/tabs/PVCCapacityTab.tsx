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
} from 'recharts'
import type { ChangeoverEvent, FilterState, StatsRow } from '../../data/types'
import { formatMinutes } from '../../utils/dates'
import InfoTooltip from '../InfoTooltip'

const PVC_MACHINES = ['1', '3', '4', '5', '7', '16', '18', '20']

// Alternating 3-day/4-day weeks, 24h/day → avg ~84h/4-day week, ~72h/3-day week
// Use a conservative average of ~78 hours/week scheduled
const SCHEDULED_HOURS_PER_WEEK = 78

const DEFAULT_SCHEDULE_ITEMS = [
  'Alternating 3-day / 4-day production weeks',
  '24 hours/day, 2 shifts',
  'No weekend production',
  'No Thursday/Friday on alternating weeks',
  'Estimated scheduled hours: ~72–84 hrs/week',
]

const DEFAULT_PVC_CONTEXT_ITEMS = [
  'PVC is ~60% of business',
  'Team is ~20–30% more efficient vs. 2 years ago',
  'May have more downtime than production time currently',
  '8 machines are PVC-capable',
]

const SCHEDULE_STORAGE_KEY = 'pp_arvada_schedule_items_v1'
const PVC_CONTEXT_STORAGE_KEY = 'pp_arvada_pvc_context_items_v1'

function loadList(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
      return parsed
    }
  } catch {}
  return fallback
}

interface Props {
  events: ChangeoverEvent[]
  statsRows: StatsRow[]
  filters: FilterState
}

export default function PVCCapacityTab({ events, statsRows, filters }: Props) {
  const [showAllMachines, setShowAllMachines] = useState(false)
  const [scheduleItems, setScheduleItems] = useState<string[]>(() =>
    loadList(SCHEDULE_STORAGE_KEY, DEFAULT_SCHEDULE_ITEMS)
  )
  const [pvcContextItems, setPvcContextItems] = useState<string[]>(() =>
    loadList(PVC_CONTEXT_STORAGE_KEY, DEFAULT_PVC_CONTEXT_ITEMS)
  )
  const [editingContext, setEditingContext] = useState(false)
  const [draftSchedule, setDraftSchedule] = useState<string[]>(scheduleItems)
  const [draftPvc, setDraftPvc] = useState<string[]>(pvcContextItems)

  function startEditing() {
    setDraftSchedule(scheduleItems)
    setDraftPvc(pvcContextItems)
    setEditingContext(true)
  }

  function cancelEditing() {
    setEditingContext(false)
  }

  function saveEditing() {
    const cleanedSchedule = draftSchedule.map(s => s.trim()).filter(Boolean)
    const cleanedPvc = draftPvc.map(s => s.trim()).filter(Boolean)
    setScheduleItems(cleanedSchedule)
    setPvcContextItems(cleanedPvc)
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(cleanedSchedule))
      localStorage.setItem(PVC_CONTEXT_STORAGE_KEY, JSON.stringify(cleanedPvc))
    } catch {}
    setEditingContext(false)
  }

  function resetToDefaults() {
    setDraftSchedule(DEFAULT_SCHEDULE_ITEMS)
    setDraftPvc(DEFAULT_PVC_CONTEXT_ITEMS)
  }

  const machinesToShow = showAllMachines
    ? [...new Set(events.map(e => e.machine))].sort(
        (a, b) => (parseInt(a) || 9999) - (parseInt(b) || 9999)
      )
    : PVC_MACHINES

  // Filter events to selected date range
  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filters.dateFrom && e.calendar_date < filters.dateFrom) return false
      if (filters.dateTo && e.calendar_date > filters.dateTo) return false
      return true
    })
  }, [events, filters])

  // PVC events only
  const pvcEvents = useMemo(
    () => filtered.filter(e => PVC_MACHINES.includes(e.machine)),
    [filtered]
  )

  // Per-machine stats for PVC machines
  const machineStats = useMemo(() => {
    return machinesToShow.map(machine => {
      const machineEvents = filtered.filter(e => e.machine === machine)
      const totalChangeoverMin = machineEvents.reduce((s, e) => s + e.duration, 0)
      const count = machineEvents.length
      const avgDuration = count > 0 ? totalChangeoverMin / count : 0

      // Derive weeks in range
      const dates = filtered.map(e => e.calendar_date)
      const minDate = dates.sort()[0]
      const maxDate = [...dates].sort().reverse()[0]
      const weeks =
        minDate && maxDate
          ? Math.max(
              1,
              Math.ceil(
                (new Date(maxDate).getTime() - new Date(minDate).getTime()) /
                  (7 * 24 * 60 * 60 * 1000)
              )
            )
          : 1
      const scheduledHours = weeks * SCHEDULED_HOURS_PER_WEEK
      const changeoverHours = totalChangeoverMin / 60
      const changeoverPct =
        scheduledHours > 0
          ? Math.min(100, Math.round((changeoverHours / scheduledHours) * 100))
          : 0

      return {
        machine,
        isPVC: PVC_MACHINES.includes(machine),
        count,
        totalChangeoverMin,
        avgDuration,
        changeoverPct,
        scheduledHours,
      }
    })
  }, [machinesToShow, filtered])

  // Stats data for PVC machines (if available)
  const hasStatsData = statsRows.length > 0
  const pvcStatsData = useMemo(() => {
    if (!hasStatsData) return []
    return PVC_MACHINES.map(machine => {
      const rows = statsRows.filter(r => r.machine === machine)
      const avgKw =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.avg_kw, 0) / rows.length
          : 0
      // Heuristic: if avg_kw < 1 kW for a machine, it's likely idle/off
      const activeDays = rows.filter(r => r.avg_kw >= 1).length
      const totalDays = rows.length
      return {
        machine: `M${machine}`,
        avgKw: Math.round(avgKw * 10) / 10,
        activePct: totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0,
      }
    })
  }, [statsRows, hasStatsData])

  const totalPVCChangeoverHours = pvcEvents.reduce((s, e) => s + e.duration, 0) / 60

  return (
    <div className="space-y-5">

      {/* Disclaimer banner */}
      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{
          background: '#fffbeb',
          border: '1px solid #fbbf24',
          color: '#78350f',
        }}
      >
        <strong>Directional Capacity View — For Context Only.</strong> This tab is intended to help
        start a conversation with plant leadership about available PVC capacity. Do not use these
        numbers to commit to customer delivery without a detailed capacity review.
      </div>

      {/* Context callout */}
      <div className="pp-card p-5" style={{ borderLeft: '4px solid #f97316' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="pp-section-title mb-0">Arvada, CO Plant Operating Context</div>
          {!editingContext ? (
            <button
              onClick={startEditing}
              className="text-xs px-3 py-1 rounded border"
              style={{ borderColor: '#e5e7eb', color: '#374151', background: '#f9fafb' }}
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={resetToDefaults}
                className="text-xs px-3 py-1 rounded border"
                style={{ borderColor: '#e5e7eb', color: '#6b7280', background: '#f9fafb' }}
              >
                Reset to Defaults
              </button>
              <button
                onClick={cancelEditing}
                className="text-xs px-3 py-1 rounded border"
                style={{ borderColor: '#e5e7eb', color: '#6b7280', background: '#f9fafb' }}
              >
                Cancel
              </button>
              <button
                onClick={saveEditing}
                className="text-xs px-3 py-1 rounded text-white"
                style={{ background: '#1e3a5f' }}
              >
                Save
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold mb-1" style={{ color: '#374151' }}>
              Current Production Schedule
            </div>
            {!editingContext ? (
              <ul className="space-y-1" style={{ color: '#6b7280' }}>
                {scheduleItems.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            ) : (
              <EditableList items={draftSchedule} onChange={setDraftSchedule} />
            )}
          </div>
          <div>
            <div className="font-semibold mb-1" style={{ color: '#374151' }}>
              PVC Context
            </div>
            {!editingContext ? (
              <ul className="space-y-1" style={{ color: '#6b7280' }}>
                {pvcContextItems.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            ) : (
              <EditableList items={draftPvc} onChange={setDraftPvc} />
            )}
          </div>
        </div>
      </div>

      {/* PVC machine toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold" style={{ color: '#374151' }}>
          Showing:
        </span>
        <button
          onClick={() => setShowAllMachines(false)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${!showAllMachines ? 'text-white' : ''}`}
          style={{
            background: !showAllMachines ? '#1e3a5f' : '#f3f4f6',
            color: !showAllMachines ? 'white' : '#374151',
          }}
        >
          PVC-Capable Machines Only
        </button>
        <button
          onClick={() => setShowAllMachines(true)}
          className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
          style={{
            background: showAllMachines ? '#1e3a5f' : '#f3f4f6',
            color: showAllMachines ? 'white' : '#374151',
          }}
        >
          All Machines
        </button>
        <span className="text-xs" style={{ color: '#9ca3af' }}>
          PVC-capable: M1, M3, M4, M5, M7, M16, M18, M20
        </span>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="pp-card p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>
            {PVC_MACHINES.length}
          </div>
          <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
            PVC-Capable Machines
          </div>
        </div>
        <div className="pp-card p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>
            {pvcEvents.length}
          </div>
          <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Changeovers (PVC machines, period)
          </div>
        </div>
        <div className="pp-card p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
            {Math.round(totalPVCChangeoverHours * 10) / 10}h
          </div>
          <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Total Changeover Hours (PVC machines)
          </div>
        </div>
      </div>

      {/* Changeover time per machine */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Total Changeover Time per Machine
          <InfoTooltip content="Total minutes spent in changeovers per machine for the selected period. Changeover time is machine-down time — this is a floor, not a full picture of available capacity." />
        </div>
        <ResponsiveContainer width="100%" height={Math.max(180, machineStats.length * 36)}>
          <BarChart
            data={machineStats.map(m => ({
              machine: `M${m.machine}`,
              hours: Math.round((m.totalChangeoverMin / 60) * 10) / 10,
              isPVC: m.isPVC,
            }))}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
            <YAxis
              type="category"
              dataKey="machine"
              tick={{ fontSize: 12, fontWeight: 600 }}
              width={40}
            />
            <Tooltip formatter={(v: number) => [`${v} hours`, 'Changeover Time']} />
            <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
              {machineStats.map((m, i) => (
                <Cell key={i} fill={m.isPVC ? '#1e3a5f' : '#9ca3af'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="pp-caption">
          Dark bars = PVC-capable machines. Changeover time is time when the machine was down for changeover — this does not represent total idle capacity.
        </p>
      </div>

      {/* Machine stats table */}
      <div className="pp-card p-5">
        <div className="pp-section-title">
          Capacity Context by Machine
          <InfoTooltip content="Changeover % of scheduled time is a rough directional indicator only. Scheduled hours assume ~78 hours/week average based on the 3/4-day alternating schedule." />
        </div>
        <div className="overflow-x-auto">
          <table className="pp-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>PVC-Capable</th>
                <th>Changeovers</th>
                <th>Total Changeover Time</th>
                <th>Avg per Changeover</th>
                <th>Changeover % of Scheduled
                  <InfoTooltip content="Rough directional estimate: total changeover hours ÷ estimated scheduled hours in period. Not a full capacity analysis." />
                </th>
              </tr>
            </thead>
            <tbody>
              {machineStats.map(m => (
                <tr key={m.machine}>
                  <td className="font-bold">M{m.machine}</td>
                  <td>
                    {m.isPVC ? (
                      <span className="pp-badge-green">PVC</span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>
                    )}
                  </td>
                  <td className="tabular-nums">{m.count}</td>
                  <td className="tabular-nums">{formatMinutes(m.totalChangeoverMin)}</td>
                  <td className="tabular-nums">
                    {m.count > 0 ? formatMinutes(m.avgDuration) : '—'}
                  </td>
                  <td className="tabular-nums">
                    {m.count > 0 ? `~${m.changeoverPct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats data section — only if available */}
      {hasStatsData && (
        <div className="pp-card p-5">
          <div className="pp-section-title">
            Machine Activity (from Stats Data)
            <InfoTooltip content="Based on uploaded stats CSV. Active days = days where average kW was at least 1 kW, suggesting the machine was running." />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={pvcStatsData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="machine" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Active Days %']} />
              <Bar dataKey="activePct" fill="#1e3a5f" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="pp-caption">
            Percentage of days in the stats data where the machine showed activity (≥1 kW avg). This is a rough proxy — review with plant leadership before drawing conclusions.
          </p>
        </div>
      )}

      {/* Footer disclaimer */}
      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280' }}
      >
        PVC-capable machines appear to have meaningful available capacity based on the current production schedule.
        This view is directional and should be reviewed with plant leadership before using in executive discussion.
        Available time does not automatically equal sellable production — quality, demand, raw material, and staffing all factor in.
      </div>

    </div>
  )
}

interface EditableListProps {
  items: string[]
  onChange: (items: string[]) => void
}

function EditableList({ items, onChange }: EditableListProps) {
  function updateItem(index: number, value: string) {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function addItem() {
    onChange([...items, ''])
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ color: '#9ca3af' }}>•</span>
          <input
            type="text"
            value={item}
            onChange={e => updateItem(i, e.target.value)}
            className="flex-1 px-2 py-1 text-sm rounded border"
            style={{ borderColor: '#d1d5db', color: '#374151' }}
          />
          <button
            onClick={() => removeItem(i)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: '#fecaca', color: '#dc2626', background: '#fef2f2' }}
            aria-label="Remove item"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addItem}
        className="text-xs px-2 py-1 rounded border mt-1"
        style={{ borderColor: '#bfdbfe', color: '#1e3a5f', background: '#eff6ff' }}
      >
        + Add line
      </button>
    </div>
  )
}
