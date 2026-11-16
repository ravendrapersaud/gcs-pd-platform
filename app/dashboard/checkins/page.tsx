'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CheckInFrequency } from '@/lib/types'
import { FREQ_LABEL, nextDueDate, todayISO } from '@/lib/checkins'
import clsx from 'clsx'

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

type Status = 'overdue' | 'due' | 'on_track' | 'not_set'

type Row = {
  id: string
  name: string
  avatar: string | null
  subtitle: string
  frequency: CheckInFrequency | null
  nextDue: string | null
  lastCheckIn: string | null
  openFollowUps: number
  status: Status
}

const STATUS_RANK: Record<Status, number> = { overdue: 0, due: 1, not_set: 2, on_track: 3 }

// A supervisor/admin's at-a-glance list of their reports' check-in status: who's
// due, who hasn't set a rhythm, open follow-ups — each linking straight into that
// person's check-in section (where the cadence is set and shared notes live).
export default function TeamCheckInsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: assigns } = await supabase
      .from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id)
    const reportIds = Array.from(new Set(((assigns ?? []) as { staff_id: string }[]).map((a) => a.staff_id)))
    if (reportIds.length === 0) { setRows([]); setLoading(false); return }

    const [{ data: profs }, { data: scheds }, { data: resp }, { data: followUps }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, avatar_url, division, department').in('id', reportIds),
      supabase.from('check_in_schedules').select('employee_id, frequency, active, start_date').in('employee_id', reportIds),
      supabase.from('form_responses').select('subject_id, submitted_at, template:form_templates(category)').in('subject_id', reportIds).eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('check_in_follow_ups').select('employee_id').in('employee_id', reportIds).eq('status', 'open'),
    ])

    const schedBy = new Map<string, { frequency: CheckInFrequency; active: boolean; start_date: string }>()
    for (const s of (scheds ?? []) as { employee_id: string; frequency: CheckInFrequency; active: boolean; start_date: string }[]) {
      schedBy.set(s.employee_id, s)
    }
    const lastBy = new Map<string, string>()
    for (const r of (resp ?? []) as { subject_id: string; submitted_at: string; template: { category?: string } | null }[]) {
      if (r.template?.category !== 'check_in') continue
      if (!lastBy.has(r.subject_id)) lastBy.set(r.subject_id, r.submitted_at)
    }
    const followUpBy = new Map<string, number>()
    for (const f of (followUps ?? []) as { employee_id: string }[]) {
      followUpBy.set(f.employee_id, (followUpBy.get(f.employee_id) ?? 0) + 1)
    }

    const today = todayISO()
    const built: Row[] = ((profs ?? []) as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; division: string | null; department: string | null }[]).map((p) => {
      const s = schedBy.get(p.id)
      const onRhythm = !!s && s.active && s.frequency !== 'none'
      const last = lastBy.get(p.id) ?? null
      const nd = s ? nextDueDate({ frequency: s.frequency, active: s.active, lastCheckIn: last, startDate: s.start_date }) : null
      let status: Status
      if (!onRhythm) status = 'not_set'
      else if (nd && nd < today) status = 'overdue'
      else if (nd && nd <= today) status = 'due'
      else status = 'on_track'
      return {
        id: p.id,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed',
        avatar: p.avatar_url,
        subtitle: [p.division, p.department].filter(Boolean).join(' · ') || '—',
        frequency: s?.frequency ?? null,
        nextDue: nd,
        lastCheckIn: last,
        openFollowUps: followUpBy.get(p.id) ?? 0,
        status,
      }
    })
    built.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name))
    setRows(built)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const counts = {
    needs: rows.filter((r) => r.status === 'overdue' || r.status === 'due').length,
    notSet: rows.filter((r) => r.status === 'not_set').length,
    onTrack: rows.filter((r) => r.status === 'on_track').length,
  }

  const statusChip = (r: Row) => {
    if (r.status === 'overdue') return <span className="badge badge-red">Due {r.nextDue ? fmtDate(r.nextDue) : ''}</span>
    if (r.status === 'due') return <span className="badge badge-red">Due now</span>
    if (r.status === 'not_set') return <span className="badge badge-yellow">No rhythm set</span>
    return <span className="badge badge-green">On track{r.nextDue ? ` · due ${fmtDate(r.nextDue)}` : ''}</span>
  }

  if (loading) return <div className="card h-64 animate-pulse bg-gray-100" />

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center space-y-2">
        <p className="text-gray-600">No one is assigned to you to check in with yet.</p>
        <Link href="/dashboard/portfolio/me#one-on-one" className="text-sm text-navy-700 font-medium hover:underline">
          Set up your own check-ins →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="badge badge-red">{counts.needs} to check in</span>
        <span className="badge badge-yellow">{counts.notSet} no rhythm</span>
        <span className="badge badge-green">{counts.onTrack} on track</span>
      </div>

      <div className="card divide-y divide-gray-100 overflow-hidden">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/dashboard/portfolio/${r.id}#one-on-one`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            {r.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatar} alt={r.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                <span className="text-navy-800 text-sm font-semibold">{r.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
              <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>
            </div>

            <div className="hidden sm:flex flex-col items-end text-xs text-gray-500 shrink-0 w-28">
              <span>{r.frequency ? FREQ_LABEL[r.frequency] : 'No cadence'}</span>
              <span>{r.lastCheckIn ? `Last ${fmtDate(r.lastCheckIn)}` : 'No check-ins yet'}</span>
            </div>

            {r.openFollowUps > 0 && (
              <span className="badge badge-navy shrink-0">{r.openFollowUps} follow-up{r.openFollowUps === 1 ? '' : 's'}</span>
            )}

            <div className={clsx('shrink-0', r.openFollowUps > 0 ? '' : 'sm:ml-0')}>{statusChip(r)}</div>

            <span className="text-navy-400 shrink-0" aria-hidden>→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
