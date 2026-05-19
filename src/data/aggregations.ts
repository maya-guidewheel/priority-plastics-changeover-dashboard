import type {
  ChangeoverEvent,
  MachineSummary,
  KPIStats,
  FilterState,
  WeeklyTrendPoint,
} from './types'
import { formatShortDate } from '../utils/dates'

export function getInferredType(
  duration: number,
  threshold: number
): 'mold-only' | 'bushing' {
  return duration < threshold ? 'mold-only' : 'bushing'
}

export function getTarget(
  type: 'mold-only' | 'bushing',
  filters: FilterState
): number {
  return type === 'mold-only' ? filters.moldTarget : filters.bushingTarget
}

export function isMeetingTarget(
  event: ChangeoverEvent,
  filters: FilterState
): boolean {
  const type = getInferredType(event.duration, filters.durationThreshold)
  return event.duration <= getTarget(type, filters)
}

export function timeAboveTarget(
  event: ChangeoverEvent,
  filters: FilterState
): number {
  const type = getInferredType(event.duration, filters.durationThreshold)
  return Math.max(0, event.duration - getTarget(type, filters))
}

function sortedDurations(events: ChangeoverEvent[]): number[] {
  return events.map(e => e.duration).sort((a, b) => a - b)
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function computeKPIs(
  events: ChangeoverEvent[],
  filters: FilterState
): KPIStats {
  if (events.length === 0) {
    return {
      totalChangeovers: 0,
      avgDuration: 0,
      medianDuration: 0,
      pctMeetingTarget: 0,
      longestDuration: 0,
      worstMachine: '—',
      totalAboveTarget: 0,
      redCount: 0,
    }
  }

  const durations = sortedDurations(events)
  const avgDuration = durations.reduce((s, d) => s + d, 0) / durations.length
  const medianDuration = median(durations)
  const longestDuration = durations[durations.length - 1]
  const meetingCount = events.filter(e => isMeetingTarget(e, filters)).length
  const pctMeetingTarget = (meetingCount / events.length) * 100
  const totalAboveTarget = events.reduce(
    (s, e) => s + timeAboveTarget(e, filters),
    0
  )
  const redCount = events.length - meetingCount

  const byMachine = new Map<string, number[]>()
  for (const e of events) {
    const arr = byMachine.get(e.machine) ?? []
    arr.push(e.duration)
    byMachine.set(e.machine, arr)
  }
  let worstMachine = '—'
  let worstAvg = 0
  byMachine.forEach((durs, machine) => {
    const avg = durs.reduce((s, d) => s + d, 0) / durs.length
    if (avg > worstAvg) {
      worstAvg = avg
      worstMachine = machine
    }
  })

  return {
    totalChangeovers: events.length,
    avgDuration,
    medianDuration,
    pctMeetingTarget,
    longestDuration,
    worstMachine,
    totalAboveTarget,
    redCount,
  }
}

export function computeMachineSummaries(
  events: ChangeoverEvent[],
  filters: FilterState
): MachineSummary[] {
  const byMachine = new Map<string, ChangeoverEvent[]>()
  for (const e of events) {
    const arr = byMachine.get(e.machine) ?? []
    arr.push(e)
    byMachine.set(e.machine, arr)
  }

  return Array.from(byMachine.entries())
    .map(([machine, evts]) => {
      const durations = sortedDurations(evts)
      const avgDuration = durations.reduce((s, d) => s + d, 0) / durations.length
      const medianDuration = median(durations)
      const longestDuration = durations[durations.length - 1]
      const meetingCount = evts.filter(e => isMeetingTarget(e, filters)).length
      const pctMeetingTarget = (meetingCount / evts.length) * 100
      const totalAboveTarget = evts.reduce(
        (s, e) => s + timeAboveTarget(e, filters),
        0
      )
      const bushingCount = evts.filter(
        e => getInferredType(e.duration, filters.durationThreshold) === 'bushing'
      ).length

      return {
        machine,
        totalChangeovers: evts.length,
        avgDuration,
        medianDuration,
        longestDuration,
        pctMeetingTarget,
        totalAboveTarget,
        bushingCount,
        moldOnlyCount: evts.length - bushingCount,
      }
    })
    .sort((a, b) => {
      const na = parseInt(a.machine) || 9999
      const nb = parseInt(b.machine) || 9999
      return na !== nb ? na - nb : a.machine.localeCompare(b.machine)
    })
}

export function computeWeeklyTrend(
  events: ChangeoverEvent[],
  filters: FilterState
): WeeklyTrendPoint[] {
  const byWeek = new Map<string, ChangeoverEvent[]>()
  for (const e of events) {
    const arr = byWeek.get(e.week_start) ?? []
    arr.push(e)
    byWeek.set(e.week_start, arr)
  }

  return Array.from(byWeek.entries())
    .map(([week_start, evts]) => {
      const durations = evts.map(e => e.duration)
      const avgDuration = durations.reduce((s, d) => s + d, 0) / durations.length
      const meetingCount = evts.filter(e => isMeetingTarget(e, filters)).length
      return {
        week_start,
        label: formatShortDate(week_start),
        avgDuration,
        count: evts.length,
        pctMeetingTarget: (meetingCount / evts.length) * 100,
      }
    })
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
}

export function getUniqueMachines(events: ChangeoverEvent[]): string[] {
  const machines = [...new Set(events.map(e => e.machine))]
  return machines.sort((a, b) => {
    const na = parseInt(a) || 9999
    const nb = parseInt(b) || 9999
    return na !== nb ? na - nb : a.localeCompare(b)
  })
}
