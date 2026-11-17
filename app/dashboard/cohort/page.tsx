'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { createClient } from '@/lib/supabase/client'
import type {
  Cohort, CohortMember, CohortSession, CohortTask, CohortSlot, Profile,
} from '@/lib/types'
import {
  SLOT_KINDS, SLOT_KIND_LABELS, campusLabel, checklistProgress, splitSessions,
  formatSessionDate, formatTimeRange, dateParts, googleCalendarUrl,
} from '@/lib/cohorts'

const nameOf = (p?: Profile | null) => (p ? `${p.first_name} ${p.last_name}`.trim() : 'A mentor')

export default function CohortHomePage() {
  const supabase = createClient()

  const [me, setMe] = useState<Profile | null>(null)
  const [cohort, setCohort] = useState<Cohort | null>(null)
  const [members, setMembers] = useState<CohortMember[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [sessions, setSessions] = useState<CohortSession[]>([])
  const [tasks, setTasks] = useState<CohortTask[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [slots, setSlots] = useState<CohortSlot[]>([])
  const [mySignups, setMySignups] = useState<Set<string>>(new Set())
  const [slotTaken, setSlotTaken] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    const p = (prof ?? null) as Profile | null
    setMe(p)
    setCanManage(p?.role === 'admin' || p?.can_manage_cohorts === true)

    // My active cohort (most recent).
    const { data: mine } = await supabase
      .from('cohort_members')
      .select('cohort_id, member_role, cohort:cohorts(*)')
      .eq('user_id', user.id)
    const active = (mine ?? [])
      .map((r) => (r as unknown as { cohort: Cohort }).cohort)
      .filter((c) => c && c.is_active)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null

    if (!active) {
      setCohort(null)
      setLoading(false)
      return
    }
    setCohort(active)

    const [{ data: mem }, { data: sess }, { data: tsk }, { data: comp }, { data: slt }, { data: sgn }, { data: counts }] =
      await Promise.all([
        supabase.from('cohort_members').select('*').eq('cohort_id', active.id),
        supabase.from('cohort_sessions').select('*').eq('cohort_id', active.id),
        supabase.from('cohort_tasks').select('*').eq('cohort_id', active.id).order('sort_order'),
        supabase.from('cohort_task_completions').select('task_id').eq('user_id', user.id),
        supabase.from('cohort_slots').select('*').eq('cohort_id', active.id),
        supabase.from('cohort_slot_signups').select('slot_id').eq('user_id', user.id),
        supabase.rpc('cohort_slot_counts', { c: active.id }),
      ])

    const memberRows = (mem ?? []) as CohortMember[]
    setMembers(memberRows)

    const ids = Array.from(new Set([
      ...memberRows.map((m) => m.user_id),
      ...((slt ?? []) as CohortSlot[]).map((s) => s.host_id).filter(Boolean) as string[],
    ]))
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id, first_name, last_name, title, email, avatar_url').in('id', ids)
      : { data: [] as Profile[] }
    const pmap: Record<string, Profile> = {}
    for (const pr of (profs ?? []) as Profile[]) pmap[pr.id] = pr
    setProfiles(pmap)

    setSessions((sess ?? []) as CohortSession[])
    setTasks((tsk ?? []) as CohortTask[])
    setDoneIds(new Set(((comp ?? []) as { task_id: string }[]).map((c) => c.task_id)))
    setSlots((slt ?? []) as CohortSlot[])
    setMySignups(new Set(((sgn ?? []) as { slot_id: string }[]).map((s) => s.slot_id)))
    const taken: Record<string, number> = {}
    for (const row of (counts ?? []) as { slot_id: string; taken: number }[]) taken[row.slot_id] = Number(row.taken)
    setSlotTaken(taken)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleTask = async (taskId: string) => {
    if (!me) return
    const has = doneIds.has(taskId)
    // optimistic
    const next = new Set(doneIds)
    has ? next.delete(taskId) : next.add(taskId)
    setDoneIds(next)
    setBusy(true); setError(null)
    const res = has
      ? await supabase.from('cohort_task_completions').delete().eq('task_id', taskId).eq('user_id', me.id)
      : await supabase.from('cohort_task_completions').insert({ task_id: taskId, user_id: me.id })
    if (res.error) {
      setError(`Could not update that item: ${res.error.message}`)
      setDoneIds(doneIds) // revert
    }
    setBusy(false)
  }

  const toggleSignup = async (slot: CohortSlot) => {
    if (!me) return
    const booked = mySignups.has(slot.id)
    setBusy(true); setError(null); setNotice(null)
    // Book / cancel via the API route so a calendar invite (or cancellation)
    // goes out to both the member and the host when the slot has a time.
    const res = await fetch('/api/cohort/slot-signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: slot.id, cancel: booked }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? (booked ? 'Could not cancel.' : 'Could not sign up.')); setBusy(false); return }
    if (booked) {
      setNotice(json.email === 'sent' ? 'Booking canceled — a calendar cancellation was sent.' : 'Booking canceled.')
    } else {
      setNotice(json.email === 'sent' ? 'Booked — a calendar invite is on its way to your email.' : 'Booked.')
    }
    setBusy(false); load()
  }

  if (loading) return <div className="card h-64 animate-pulse bg-gray-100" />

  if (!cohort) {
    return (
      <div className="card p-6 space-y-2">
        <h2 className="font-display font-bold text-navy-900 text-lg">New Faculty</h2>
        <p className="text-sm text-gray-600">You’re not in an active cohort right now.</p>
        {canManage && (
          <Link href="/dashboard/cohorts" className="btn-primary text-sm inline-block mt-2">Manage cohorts →</Link>
        )}
      </div>
    )
  }

  const prof = (uid: string) => profiles[uid]
  const generalTasks = tasks.filter((t) => !t.session_id)
  const { upcoming, past } = splitSessions(sessions)
  const prog = checklistProgress(tasks, doneIds)
  const facilitators = members.filter((m) => m.member_role === 'facilitator')
  const peers = members.filter((m) => m.member_role === 'member')

  const TaskRow = ({ t }: { t: CohortTask }) => {
    const checked = doneIds.has(t.id)
    return (
      <li className="flex items-start gap-3 py-2">
        <button
          onClick={() => toggleTask(t.id)} disabled={busy} aria-pressed={checked}
          className={clsx('mt-0.5 w-5 h-5 rounded border grid place-items-center shrink-0 transition-colors',
            checked ? 'bg-navy-700 border-navy-700 text-white' : 'border-gray-300 hover:border-navy-400')}
        >
          {checked && (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          )}
        </button>
        <div className="min-w-0">
          <p className={clsx('text-sm', checked ? 'text-gray-400 line-through' : 'text-gray-800')}>
            {t.title} {t.required && !checked && <span className="badge badge-yellow text-[10px] ml-1">Required</span>}
          </p>
          {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
          <div className="flex gap-3 text-xs mt-0.5">
            {t.link_url && <a href={t.link_url} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline">Open link →</a>}
            {t.due_date && <span className="text-gray-400">Due {formatSessionDate(t.due_date)}</span>}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {notice && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{notice}</div>}

      {/* Hero */}
      <div className="card p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 px-6 py-6">
          <p className="text-navy-200 text-xs font-semibold uppercase tracking-widest">Welcome to Grace</p>
          <h1 className="font-display font-bold text-white text-2xl mt-1">{cohort.name}</h1>
          {cohort.school_year && <p className="text-navy-200 text-sm mt-0.5">{cohort.school_year}</p>}
          <div className="mt-4 max-w-md">
            <div className="flex items-center justify-between text-xs text-navy-100 mb-1">
              <span>Onboarding checklist</span>
              <span>{prog.done}/{prog.total} done</span>
            </div>
            <div className="w-full bg-white/15 rounded-full h-2.5">
              <div className="h-2.5 rounded-full bg-grace-green transition-all" style={{ width: `${prog.pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: checklist + schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* Checklist */}
          <section className="card p-5">
            <h2 className="font-display font-bold text-navy-900">Your checklist</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 mt-2">Nothing here yet — your facilitator will add onboarding tasks.</p>
            ) : (
              <div className="mt-2 divide-y divide-gray-100">
                {generalTasks.length > 0 && (
                  <div className="py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Getting started</p>
                    <ul>{generalTasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
                  </div>
                )}
                {upcoming.map((s) => {
                  const st = tasks.filter((t) => t.session_id === s.id)
                  if (st.length === 0) return null
                  return (
                    <div key={s.id} className="py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Prep for {s.title}</p>
                      <ul>{st.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Schedule */}
          <section className="card p-5">
            <h2 className="font-display font-bold text-navy-900 mb-3">Your schedule</h2>
            {upcoming.length === 0 && past.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions scheduled yet.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => <SessionRow key={s.id} s={s} />)}
                {past.length > 0 && (
                  <details className="pt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">Past sessions ({past.length})</summary>
                    <div className="mt-2 space-y-2 opacity-70">{past.map((s) => <SessionRow key={s.id} s={s} />)}</div>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right: book time + cohort space */}
        <div className="space-y-6">
          {/* Book time */}
          <section className="card p-5">
            <h2 className="font-display font-bold text-navy-900 mb-1">Book time</h2>
            <p className="text-xs text-gray-500 mb-3">One-on-ones, office hours, and observational walks.</p>
            {slots.length === 0 ? (
              <p className="text-sm text-gray-400">No slots offered yet.</p>
            ) : (
              <div className="space-y-4">
                {SLOT_KINDS.map((kind) => {
                  const group = slots
                    .filter((s) => s.kind === kind)
                    .sort((a, b) =>
                      (a.slot_date ?? '9999').localeCompare(b.slot_date ?? '9999') ||
                      (a.start_time ?? '').localeCompare(b.start_time ?? '')
                    )
                  if (group.length === 0) return null
                  return (
                    <div key={kind}>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-navy-600 mb-1.5">{SLOT_KIND_LABELS[kind]}</p>
                      <ul className="space-y-2">
                        {group.map((s) => {
                          const booked = mySignups.has(s.id)
                          const taken = slotTaken[s.id] ?? 0
                          const full = !booked && taken >= s.capacity
                          const dp = dateParts(s.slot_date)
                          return (
                            <li key={s.id} className="rounded-lg border border-gray-200 p-3">
                              <div className="flex gap-3">
                                <div className="shrink-0 w-11 rounded-lg bg-navy-50 border border-navy-100 text-navy-800 text-center py-1 self-start">
                                  {dp ? (
                                    <>
                                      <div className="text-[9px] font-bold uppercase tracking-wide text-navy-600">{dp.month}</div>
                                      <div className="text-lg font-bold leading-none">{dp.day}</div>
                                    </>
                                  ) : (
                                    <div className="text-[9px] font-semibold py-1.5 text-navy-500">TBD</div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-navy-900">{formatTimeRange(s.start_time, s.end_time) || 'Time TBD'}</p>
                                  <p className="text-xs text-gray-500">with {nameOf(prof(s.host_id ?? ''))}{s.location && ` · ${s.location}`}</p>
                                  {s.title && <p className="text-xs text-gray-400 truncate">{s.title}</p>}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[11px] text-gray-400">{taken}/{s.capacity} booked</span>
                                <button
                                  onClick={() => toggleSignup(s)} disabled={busy || full}
                                  className={clsx('text-xs px-2.5 py-1 rounded-md font-medium',
                                    booked ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      : full ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'btn-primary')}
                                >
                                  {booked ? 'Cancel' : full ? 'Full' : 'Sign up'}
                                </button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Cohort space + people */}
          <section className="card p-5">
            <h2 className="font-display font-bold text-navy-900 mb-2">Your cohort</h2>
            {cohort.workspace_id && (
              <Link href={`/dashboard/workspaces/${cohort.workspace_id}`} className="btn-secondary text-sm w-full justify-center inline-flex mb-3">
                Open cohort space →
              </Link>
            )}
            {facilitators.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Facilitators</p>
                <p className="text-sm text-gray-700">{facilitators.map((m) => nameOf(prof(m.user_id))).join(', ')}</p>
              </div>
            )}
            {peers.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cohort ({peers.length})</p>
                <p className="text-sm text-gray-700">{peers.map((m) => nameOf(prof(m.user_id))).join(', ')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function SessionRow({ s }: { s: CohortSession }) {
  const dp = dateParts(s.session_date)
  const gcal = googleCalendarUrl(s)
  return (
    <div className="rounded-lg border border-gray-200 p-3 flex gap-3">
      {/* Prominent calendar-tile date */}
      <div className="shrink-0 w-14 rounded-lg bg-navy-50 border border-navy-100 text-navy-800 text-center py-1.5 self-start">
        {dp ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wide text-navy-600">{dp.month}</div>
            <div className="text-xl font-bold leading-none">{dp.day}</div>
            <div className="text-[10px] text-navy-500 mt-0.5">{dp.weekday}</div>
          </>
        ) : (
          <div className="text-[10px] font-semibold py-2 text-navy-500">TBD</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy-900">{s.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatTimeRange(s.start_time, s.end_time) && `${formatTimeRange(s.start_time, s.end_time)} · `}
          {campusLabel(s.campus)}{s.location && ` · ${s.location}`}{s.presenter && ` · ${s.presenter}`}
        </p>
        {s.prep_notes && <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Prep:</span> {s.prep_notes}</p>}
        <div className="flex flex-wrap gap-3 mt-1">
          {s.resource_url && <a href={s.resource_url} target="_blank" rel="noopener noreferrer" className="text-xs text-navy-700 hover:underline">Resource →</a>}
          {gcal && <a href={gcal} target="_blank" rel="noopener noreferrer" className="text-xs text-navy-700 hover:underline font-medium">Add to calendar →</a>}
        </div>
      </div>
    </div>
  )
}
