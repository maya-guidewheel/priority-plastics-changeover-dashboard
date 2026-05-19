import { format, startOfWeek, isValid } from 'date-fns'

export function parseTimestamp(s: string): Date | null {
  if (!s || !s.trim()) return null
  const cleaned = s.trim().replace(/\//g, '-')
  const dt = new Date(cleaned)
  if (isValid(dt)) return dt
  return null
}

export function getCalendarDate(dt: Date): string {
  return format(dt, 'yyyy-MM-dd')
}

export function getWeekStart(dt: Date): string {
  const monday = startOfWeek(dt, { weekStartsOn: 1 })
  return format(monday, 'yyyy-MM-dd')
}

export function formatShortDate(s: string): string {
  const dt = new Date(s + 'T00:00:00')
  if (!isValid(dt)) return s
  return format(dt, 'MMM d')
}

export function formatMinutes(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return '0m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatDateTime(isoStr: string): string {
  const dt = new Date(isoStr)
  if (!isValid(dt)) return isoStr
  return format(dt, 'MMM d, yyyy h:mm a')
}
