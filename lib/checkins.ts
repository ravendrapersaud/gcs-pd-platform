// Pure check-in cadence helpers, shared by the portfolio "Your 1:1" card and the
// dashboard quick-items tile. No React, no Supabase — just date math + labels.
import type { CheckInFrequency } from './types'

export const FREQ_LABEL: Record<CheckInFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  twice_yearly: 'Twice a year',
  none: 'No set cadence',
}

// Plain-language adverb for a sentence like "You check in <adverb>".
export const FREQ_ADVERB: Record<CheckInFrequency, string> = {
  weekly: 'weekly',
  biweekly: 'every two weeks',
  monthly: 'monthly',
  quarterly: 'quarterly',
  twice_yearly: 'twice a year',
  none: 'as needed',
}

export const FREQS: CheckInFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'twice_yearly', 'none']

export const todayISO = () => new Date().toISOString().slice(0, 10)

// Add one cadence interval to a yyyy-mm-dd (or ISO) date; null for 'none'/bad input.
export function addInterval(dateStr: string, freq: CheckInFrequency): string | null {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  if (isNaN(d.getTime())) return null
  switch (freq) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'twice_yearly': d.setMonth(d.getMonth() + 6); break
    default: return null
  }
  return d.toISOString().slice(0, 10)
}

// The next-due date for a cadence given the last check-in (or the start date as a
// fallback anchor). Returns null when there's no active cadence to project from.
export function nextDueDate(opts: {
  frequency: CheckInFrequency
  active: boolean
  lastCheckIn?: string | null
  startDate?: string | null
}): string | null {
  if (!opts.active) return null
  const anchor = opts.lastCheckIn ? opts.lastCheckIn.slice(0, 10) : (opts.startDate ?? null)
  if (!anchor) return null
  return addInterval(anchor, opts.frequency)
}

export const isOverdue = (dueISO: string | null): boolean => !!dueISO && dueISO < todayISO()
