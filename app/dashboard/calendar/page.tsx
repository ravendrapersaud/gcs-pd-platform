'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PdEvent } from '@/lib/types'
import { EVENT_TYPES, AUDIENCES } from '@/lib/taxonomy'
import clsx from 'clsx'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Parse a 'YYYY-MM-DD' date string as a local date (no timezone shift).
function parseDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function fmtDateBlock(d: string) {
  const date = parseDate(d)
  return {
    month: MONTH_NAMES[date.getMonth()].slice(0, 3).toUpperCase(),
    day: date.getDate(),
  }
}

function fmtRange(start: string, end: string | null) {
  const s = parseDate(start)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (!end || end === start) return s.toLocaleDateString('en-US', opts)
  const e = parseDate(end)
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
}

const eventTypeColor: Record<string, string> = {
  Conference: 'badge-navy',
  Workshop: 'badge-green',
  Webinar: 'badge-yellow',
  'Local Event': 'badge-gray',
  'Certificate Program': 'badge-red',
}

export default function CalendarPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<PdEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('staff')
  const [userId, setUserId] = useState<string | null>(null)

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Search & filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [audienceFilter, setAudienceFilter] = useState<string>('')

  // Add-event form
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    event_type: 'Conference',
    location: '',
    is_virtual: false,
    start_date: today.toISOString().split('T')[0],
    end_date: '',
    url: '',
    cost: '',
  })
  const [formAudience, setFormAudience] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: evs }, { data: prof }] = await Promise.all([
      supabase.from('pd_events').select('*').order('start_date', { ascending: true }),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
    ])

    setEvents((evs ?? []) as PdEvent[])
    if (prof?.role) setRole(prof.role)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const canManage = role === 'supervisor' || role === 'admin'

  // ── Search & filter (applies to grid AND upcoming list) ─────
  const filteredEvents = events.filter((e) => {
    const q = search.trim().toLowerCase()
    const haystack = [
      e.title, e.description, e.location, e.event_type,
      ...(e.audience ?? []),
    ].filter(Boolean).join(' ').toLowerCase()
    const matchSearch = !q || haystack.includes(q)
    const matchType = !typeFilter || e.event_type === typeFilter
    const matchAudience = !audienceFilter || (e.audience ?? []).includes(audienceFilter)
    return matchSearch && matchType && matchAudience
  })

  const filtersActive = Boolean(search.trim() || typeFilter || audienceFilter)

  // ── Month grid math ────────────────────────────────────────
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsOnDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filteredEvents.filter((e) => {
      const start = e.start_date
      const end = e.end_date ?? e.start_date
      return iso >= start && iso <= end
    })
  }

  const goToToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  // Jump straight to the month of the next matching event.
  const goToNextEvent = () => {
    const todayIso2 = today.toISOString().split('T')[0]
    const next = filteredEvents
      .filter((e) => (e.end_date ?? e.start_date) >= todayIso2)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    if (next) {
      const d = parseDate(next.start_date)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else setViewMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else setViewMonth((m) => m + 1)
  }

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()

  const todayIso = today.toISOString().split('T')[0]
  const upcoming = filteredEvents
    .filter((e) => (e.end_date ?? e.start_date) >= todayIso)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  const toggleAudience = (value: string) =>
    setFormAudience((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (!userId) throw new Error('Not authenticated')
      const { error: insertErr } = await supabase.from('pd_events').insert({
        title: form.title,
        event_type: form.event_type,
        location: form.is_virtual ? null : form.location || null,
        is_virtual: form.is_virtual,
        start_date: form.start_date,
        end_date: form.end_date || null,
        url: form.url || null,
        cost: form.cost === '' ? null : Number(form.cost),
        audience: formAudience,
        created_by: userId,
      })
      if (insertErr) throw insertErr
      setShowForm(false)
      setForm({
        title: '',
        event_type: 'Conference',
        location: '',
        is_virtual: false,
        start_date: today.toISOString().split('T')[0],
        end_date: '',
        url: '',
        cost: '',
      })
      setFormAudience([])
      await load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header + add button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Professional Development Calendar</h2>
          <p className="text-sm text-gray-500">Upcoming conferences, workshops, and learning opportunities.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary shrink-0">
            {showForm ? 'Close' : '+ Add Event'}
          </button>
        )}
      </div>

      {/* Add event form */}
      {canManage && showForm && (
        <div className="card p-6">
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="ev-title">Title <span className="text-red-500">*</span></label>
              <input
                id="ev-title"
                required
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. NYSAIS Emerging Leaders Workshop"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="ev-type">Type</label>
                <select
                  id="ev-type"
                  className="input"
                  value={form.event_type}
                  onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ev-cost">Cost (USD)</label>
                <input
                  id="ev-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0 = Free"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="ev-start">Start date <span className="text-red-500">*</span></label>
                <input
                  id="ev-start"
                  type="date"
                  required
                  className="input"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="ev-end">End date</label>
                <input
                  id="ev-end"
                  type="date"
                  className="input"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="ev-virtual"
                type="checkbox"
                checked={form.is_virtual}
                onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-navy-900 focus:ring-navy-500"
              />
              <label htmlFor="ev-virtual" className="text-sm text-gray-700">Virtual event</label>
            </div>

            {!form.is_virtual && (
              <div>
                <label className="label" htmlFor="ev-location">Location</label>
                <input
                  id="ev-location"
                  className="input"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="City, State"
                />
              </div>
            )}

            <div>
              <label className="label" htmlFor="ev-url">URL</label>
              <input
                id="ev-url"
                type="url"
                className="input"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="label">Audience</label>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => {
                  const active = formAudience.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAudience(a)}
                      className={clsx(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        active
                          ? 'bg-navy-900 text-white border-navy-900'
                          : 'border-gray-300 text-gray-600 hover:border-navy-400'
                      )}
                    >
                      {a}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Add Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & filters */}
      <div className="card p-4 space-y-3">
        <input
          type="text"
          className="input"
          placeholder="Search PD by topic or keyword — e.g. AI, literacy, leadership, Boston…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto text-sm py-1.5"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by event type"
          >
            <option value="">All types</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="input w-auto text-sm py-1.5"
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            aria-label="Filter by audience"
          >
            <option value="">All audiences</option>
            {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {filtersActive && (
            <>
              <span className="text-xs text-gray-500">
                {upcoming.length} upcoming event{upcoming.length === 1 ? '' : 's'} match
                {filteredEvents.length > upcoming.length &&
                  ` (${filteredEvents.length - upcoming.length} past)`}
              </span>
              <button
                type="button"
                onClick={() => { setSearch(''); setTypeFilter(''); setAudienceFilter('') }}
                className="text-xs text-navy-800 font-medium hover:underline"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={goToNextEvent}
                className="text-xs text-navy-800 font-medium hover:underline"
              >
                Jump to next match →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Month grid */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <button type="button" onClick={prevMonth} className="btn-secondary text-sm px-3 py-1.5" aria-label="Previous month">
            ← Prev
          </button>
          <div className="flex items-center gap-3">
            <h3 className="font-display text-lg text-navy-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h3>
            {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
              <button
                type="button"
                onClick={goToToday}
                className="text-xs text-navy-800 font-medium hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <button type="button" onClick={nextMonth} className="btn-secondary text-sm px-3 py-1.5" aria-label="Next month">
            Next →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 py-1">
              {wd}
            </div>
          ))}
          {cells.map((day, i) => {
            const dayEvents = day ? eventsOnDay(day) : []
            return (
              <div
                key={i}
                className={clsx(
                  'min-h-[76px] rounded-lg border p-1.5 text-left align-top',
                  day ? 'border-gray-100 bg-white' : 'border-transparent bg-transparent'
                )}
              >
                {day && (
                  <>
                    <div
                      className={clsx(
                        'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                        isToday(day) ? 'bg-navy-900 text-white' : 'text-gray-600'
                      )}
                    >
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((e) => (
                        <a
                          key={e.id}
                          href={e.url ?? undefined}
                          target={e.url ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          title={e.title}
                          className="block truncate text-[10px] leading-tight px-1 py-0.5 rounded bg-navy-100 text-navy-800 hover:bg-navy-200"
                        >
                          {e.title}
                        </a>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 2} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming events list */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Upcoming events</h3>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-24 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>{filtersActive ? 'No upcoming events match your search.' : 'No upcoming events.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((e) => {
              const block = fmtDateBlock(e.start_date)
              return (
                <div key={e.id} className="card p-4 flex gap-4 items-start hover:shadow-md transition-shadow">
                  {/* Date block */}
                  <div className="shrink-0 w-14 text-center rounded-lg bg-navy-900 text-white py-2">
                    <p className="text-[10px] font-semibold tracking-wide">{block.month}</p>
                    <p className="text-xl font-bold leading-none">{block.day}</p>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-gray-900 text-sm leading-snug">{e.title}</h4>
                      {e.event_type && (
                        <span className={clsx('badge shrink-0', eventTypeColor[e.event_type] ?? 'badge-gray')}>
                          {e.event_type}
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{e.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                      <span>{fmtRange(e.start_date, e.end_date)}</span>
                      <span>·</span>
                      <span>{e.is_virtual ? 'Virtual' : (e.location ?? '—')}</span>
                      <span>·</span>
                      <span className="font-medium text-gray-700">
                        {e.cost === null || e.cost === 0 ? 'Free' : `$${Number(e.cost).toLocaleString()}`}
                      </span>
                    </div>
                    {e.audience.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {e.audience.map((a) => (
                          <span key={a} className="badge badge-gray text-[10px]">{a}</span>
                        ))}
                      </div>
                    )}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-navy-800 text-xs font-semibold hover:text-navy-900 mt-2"
                      >
                        Details →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
