// Pure helpers for New Faculty cohorts — labels, checklist progress, and
// session/date math. No React, no Supabase. Mirrors lib/checkins.ts.
import type { CohortSession, CohortTask, SlotKind, CohortMemberRole } from './types'
import { zonedWallClockToUtc } from './ics'

export const SLOT_KINDS: SlotKind[] = ['one_on_one', 'office_hours', 'observation_walk']

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  one_on_one: 'One-on-one',
  office_hours: 'Office hours',
  observation_walk: 'Observational walk',
}

export const SLOT_KIND_BLURBS: Record<SlotKind, string> = {
  one_on_one: 'A scheduled check-in with a mentor or administrator.',
  office_hours: 'Drop-in time — bring whatever questions you have.',
  observation_walk: 'Visit a colleague’s class together and debrief.',
}

export const MEMBER_ROLE_LABELS: Record<CohortMemberRole, string> = {
  member: 'Member',
  facilitator: 'Facilitator',
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

// Campus label (the school's two campuses; null = both).
export function campusLabel(campus: string | null | undefined): string {
  if (campus === '86') return '86th St'
  if (campus === '46') return '46th St'
  return 'All campuses'
}

// Checklist completion for a set of tasks given the ids the person has ticked.
export function checklistProgress(
  tasks: { id: string }[],
  completedTaskIds: Set<string> | string[]
): { done: number; total: number; pct: number } {
  const done = new Set(completedTaskIds instanceof Set ? [...completedTaskIds] : completedTaskIds)
  const total = tasks.length
  const count = tasks.reduce((n, t) => (done.has(t.id) ? n + 1 : n), 0)
  return { done: count, total, pct: total === 0 ? 0 : Math.round((count / total) * 100) }
}

// Split sessions into upcoming (today or later, or undated) and past. Sorted:
// upcoming ascending by date then sort_order; past descending.
export function splitSessions(
  sessions: CohortSession[],
  today: string = todayISO()
): { upcoming: CohortSession[]; past: CohortSession[] } {
  const upcoming: CohortSession[] = []
  const past: CohortSession[] = []
  for (const s of sessions) {
    if (s.session_date && s.session_date < today) past.push(s)
    else upcoming.push(s)
  }
  upcoming.sort(
    (a, b) =>
      (a.session_date ?? '9999').localeCompare(b.session_date ?? '9999') ||
      a.sort_order - b.sort_order
  )
  past.sort((a, b) => (b.session_date ?? '').localeCompare(a.session_date ?? ''))
  return { upcoming, past }
}

// The next upcoming dated session (for the dashboard hero line).
export function nextSession(sessions: CohortSession[], today: string = todayISO()): CohortSession | null {
  return splitSessions(sessions, today).upcoming.find((s) => s.session_date) ?? null
}

// Pretty date like "Thu, Oct 16" (no year) or "Oct 16, 2027" when far out.
export function formatSessionDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Date TBD'
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  if (isNaN(d.getTime())) return 'Date TBD'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// Format an HH:MM[:SS] time to "7:45 AM"; '' for null.
export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  if (isNaN(h) || isNaN(m)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

// "7:45 – 8:15 AM" style range; collapses to one time when end is absent.
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = formatTime(start)
  const e = formatTime(end)
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

// Weekday / month / day pieces for a prominent calendar-tile date chip.
export function dateParts(
  dateStr: string | null | undefined
): { weekday: string; month: string; day: string } | null {
  if (!dateStr) return null
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  if (isNaN(d.getTime())) return null
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day: String(d.getDate()),
  }
}

// A Google Calendar "add event" link for a session (one click → prefilled event
// → Save, for a Google Workspace school). Timed when the session has start/end,
// otherwise an all-day event on its date (the seeded sessions carry their
// per-campus times in `location`). Returns null for an undated session.
function ymd(dateISO: string): string {
  return dateISO.slice(0, 10).replace(/-/g, '')
}
function nextYmd(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`
}
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
export function googleCalendarUrl(s: {
  title: string
  session_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  presenter: string | null
  prep_notes: string | null
}): string | null {
  if (!s.session_date) return null
  const params = new URLSearchParams({ action: 'TEMPLATE', text: s.title })
  let dates: string | null = null
  if (s.start_time) {
    const start = zonedWallClockToUtc(s.session_date, s.start_time)
    const end = (s.end_time ? zonedWallClockToUtc(s.session_date, s.end_time) : null)
      ?? (start ? new Date(start.getTime() + 30 * 60000) : null)
    if (start && end) dates = `${utcStamp(start)}/${utcStamp(end)}`
  }
  if (!dates) dates = `${ymd(s.session_date)}/${nextYmd(s.session_date)}` // all-day
  params.set('dates', dates)
  const details = [
    s.presenter ? `Presenter: ${s.presenter}` : null,
    s.prep_notes ? `Prep: ${s.prep_notes}` : null,
  ].filter(Boolean).join('\n')
  if (details) params.set('details', details)
  if (s.location) params.set('location', s.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
