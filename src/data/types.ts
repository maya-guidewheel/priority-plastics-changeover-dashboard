export interface RawRow {
  Start: string
  End: string
  'Duration (minutes)': string
  Devices: string
  Status: string
  Type: string
  'Alert Type': string
  'Time to Acknowledge (TTA)': string
  Action: string
  Assignees: string
  Tags: string
  Comments: string
  Changelog: string
}

export interface ChangeoverEvent {
  start_dt: Date
  end_dt: Date
  duration: number
  machine: string
  shift: string
  inferred_type: 'mold-only' | 'bushing'
  status: string
  calendar_date: string
  week_start: string
  tags: string
  comments: string
}

export interface MachineSummary {
  machine: string
  totalChangeovers: number
  avgDuration: number
  medianDuration: number
  longestDuration: number
  pctMeetingTarget: number
  totalAboveTarget: number
  bushingCount: number
  moldOnlyCount: number
}

export interface FilterState {
  dateFrom: string
  dateTo: string
  machines: string[]
  changeoverTypeFilter: 'all' | 'mold-only' | 'bushing'
  durationThreshold: number
  moldTarget: number
  bushingTarget: number
}

export interface KPIStats {
  totalChangeovers: number
  avgDuration: number
  medianDuration: number
  pctMeetingTarget: number
  longestDuration: number
  worstMachine: string
  totalAboveTarget: number
  redCount: number
}

export interface StatsRow {
  machine: string
  date: string
  avg_kw: number
}

export interface WeeklyTrendPoint {
  week_start: string
  label: string
  avgDuration: number
  count: number
  pctMeetingTarget: number
}
