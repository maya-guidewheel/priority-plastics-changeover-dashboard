import Papa from 'papaparse'
import type { RawRow, ChangeoverEvent, StatsRow } from './types'
import { parseTimestamp, getCalendarDate, getWeekStart } from '../utils/dates'

const CHANGEOVER_PATTERNS = [
  'changeover',
  'change-over',
  'mold change',
  'mold-change',
  'bushing',
  'color change',
  'setup',
  'tooling',
]

function hasChangeoverTag(tags: string): boolean {
  if (!tags?.trim()) return false
  const lower = tags.toLowerCase()
  return CHANGEOVER_PATTERNS.some(p => lower.includes(p))
}

// Normalize Guidewheel device ID to a simple machine number/name.
function normalizeMachine(device: string): string {
  const s = device
    .replace(/^machine\s*/i, '')
    .replace(/^machine-/i, '')
    .replace(/^pp-?0*/i, '')
    .trim()
  const numMatch = s.match(/^(\d+)/)
  if (numMatch) return String(parseInt(numMatch[1], 10))
  return device.trim()
}

export function parseChangeoverCSV(csvText: string): ChangeoverEvent[] {
  const result = Papa.parse<RawRow>(csvText.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.data.length === 0) return []

  // If any rows have changeover tags, filter to only those.
  // Otherwise accept all rows (export may already be pre-filtered).
  const anyTagged = result.data.some(row => hasChangeoverTag(row.Tags || ''))

  const events: ChangeoverEvent[] = []

  for (const row of result.data) {
    const device = (row.Devices || '').trim()
    if (!device) continue

    if (anyTagged && !hasChangeoverTag(row.Tags || '')) continue

    const durationStr = (row['Duration (minutes)'] || '').trim()
    if (!durationStr || durationStr.toLowerCase() === 'ongoing') continue

    const duration = parseFloat(durationStr)
    if (isNaN(duration) || duration <= 0 || duration >= 720) continue

    const endStr = (row.End || '').trim()
    if (!endStr) continue

    const start_dt = parseTimestamp(row.Start)
    const end_dt = parseTimestamp(endStr)
    if (!start_dt || !end_dt) continue

    const machine = normalizeMachine(device)

    events.push({
      start_dt,
      end_dt,
      duration,
      machine,
      shift: '',
      inferred_type: 'bushing',
      status: (row.Status || '').trim(),
      calendar_date: getCalendarDate(start_dt),
      week_start: getWeekStart(start_dt),
      tags: (row.Tags || '').trim(),
      comments: (row.Comments || '').trim(),
    })
  }

  return events
}

// Parse Guidewheel stats CSV: semicolon-delimited, machines as columns
// Header: Date;Machine1 (Averages: KW);Machine2 (Averages: KW);...
export function parseStatsCSV(csvText: string): StatsRow[] {
  const rows: StatsRow[] = []
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/)
  if (lines.length < 2) return rows

  const header = lines[0].split(';').map(h => h.replace(/"/g, '').trim())

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(';').map(p => p.replace(/"/g, '').trim())
    const date = parts[0]
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue

    for (let j = 1; j < header.length; j++) {
      const machineHeader = header[j]
      if (!machineHeader) continue
      const machineRaw = machineHeader.split('(')[0].trim()
      const machine = normalizeMachine(machineRaw)
      const kwStr = parts[j]
      if (!kwStr) continue
      const avg_kw = parseFloat(kwStr)
      if (isNaN(avg_kw)) continue
      rows.push({ machine, date: date.slice(0, 10), avg_kw })
    }
  }

  return rows
}
