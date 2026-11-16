'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CheckInFrequency } from '@/lib/types'
import { nextDueDate, isOverdue, todayISO } from '@/lib/checkins'
import clsx from 'clsx'

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

type SchedRow = { employee_id: string; frequency: CheckInFrequency; active: boolean; start_date: string }

// A compact "Check-ins" row for the dashboard: your next check-in + open
// follow-ups, and (for supervisors) how many reports are due. Client-side so it
// can reuse the cadence math and respect RLS as the signed-in user.
export default function DashboardCheckIns() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [mySched, setMySched] = useState<SchedRow | null>(null)
  const [myLast, setMyLast] = useState<string | null>(null)
  const [myOpen, setMyOpen] = useState(0)
  const [reportsTotal, setReportsTotal] = useState(0)
  const [reportsDue, setReportsDue] = useState(0)
  const [reportsNoCadence, setReportsNoCadence] = useState(0)
  const [myDept, setMyDept] = useState<string | null>(null)
  const [deptCount, setDeptCount] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: sched }, { data: resp }, { count: openCount }, { data: assigns }, { data: prof }] = await Promise.all([
      supabase.from('check_in_schedules').select('employee_id, frequency, active, start_date').eq('employee_id', user.id).maybeSingle(),
      supabase.from('form_responses').select('submitted_at, template:form_templates(category)').eq('subject_id', user.id).eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('check_in_follow_ups').select('id', { count: 'exact', head: true }).eq('employee_id', user.id).eq('status', 'open'),
      supabase.from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id),
      supabase.from('profiles').select('department').eq('id', user.id).maybeSingle(),
    ])

    const dept = (((prof as { department: string | null } | null)?.department) ?? '').trim() || null
    setMyDept(dept)
    setMySched((sched ?? null) as SchedRow | null)
    setMyLast(((resp ?? []).find((r) => (r.template as { category?: string } | null)?.category === 'check_in')?.submitted_at as string) ?? null)
    setMyOpen(openCount ?? 0)

    const reportIds = Array.from(new Set(((assigns ?? []) as { staff_id: string }[]).map((a) => a.staff_id)))
    setReportsTotal(reportIds.length)

    if (reportIds.length > 0) {
      const [{ data: rSched }, { data: rResp }] = await Promise.all([
        supabase.from('check_in_schedules').select('employee_id, frequency, active, start_date').in('employee_id', reportIds),
        supabase.from('form_responses').select('subject_id, submitted_at, template:form_templates(category)').in('subject_id', reportIds).eq('status', 'submitted').order('submitted_at', { ascending: false }),
      ])
      // Latest check-in per report.
      const lastBy = new Map<string, string>()
      for (const r of (rResp ?? []) as { subject_id: string; submitted_at: string; template: { category?: string } | null }[]) {
        if (r.template?.category !== 'check_in') continue
        if (!lastBy.has(r.subject_id)) lastBy.set(r.subject_id, r.submitted_at)
      }
      const today = todayISO()
      let due = 0
      // A report is "on a rhythm" only with an active schedule and a real cadence.
      const onRhythm = new Set<string>()
      for (const s of (rSched ?? []) as SchedRow[]) {
        if (s.active && s.frequency !== 'none') onRhythm.add(s.employee_id)
        const nd = nextDueDate({ frequency: s.frequency, active: s.active, lastCheckIn: lastBy.get(s.employee_id) ?? null, startDate: s.start_date })
        if (nd && nd <= today) due += 1
      }
      setReportsDue(due)
      // Reports with no active cadence at all (never set up, or paused) still need
      // attention — otherwise "All caught up" hides people who aren't on a rhythm.
      setReportsNoCadence(reportIds.filter((id) => !onRhythm.has(id)).length)
    } else if (dept) {
      // Non-supervisor: size their department for the "Your department" tile.
      const { count: dc } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('department', dept)
      setDeptCount(dc ?? 0)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="card h-24 animate-pulse bg-gray-100" />

  const myNext = mySched ? nextDueDate({ frequency: mySched.frequency, active: mySched.active, lastCheckIn: myLast, startDate: mySched.start_date }) : null
  const myOverdue = isOverdue(myNext)

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-gray-900 text-lg">Check-ins</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Your next check-in */}
        <Link href="/dashboard/portfolio/me#one-on-one" className="card p-5 hover:shadow-md transition-shadow flex flex-col gap-1">
          <p className="text-sm font-medium text-gray-500">Your next check-in</p>
          {!mySched ? (
            <p className="text-2xl font-bold text-navy-900">No rhythm set yet</p>
          ) : myNext ? (
            <p className={clsx('text-2xl font-bold', myOverdue ? 'text-red-600' : 'text-navy-900')}>
              {myOverdue ? 'Due now' : `Due ${fmtDate(myNext)}`}
            </p>
          ) : (
            <p className="text-2xl font-bold text-navy-900">No set cadence</p>
          )}
          <p className="text-sm text-gray-500">
            {myOpen > 0 ? <span className={myOverdue ? '' : 'text-gray-700 font-medium'}>{myOpen} follow-up{myOpen === 1 ? '' : 's'} open</span> : 'No open follow-ups'}
          </p>
          <span className="text-sm text-navy-700 font-medium mt-auto pt-1">{mySched ? 'Open your check-ins →' : 'Set up check-ins →'}</span>
        </Link>

        {/* Second tile: your team (supervisors) or your department (everyone else) */}
        {reportsTotal > 0 ? (
          <Link href="/dashboard/goals?tab=team" className="card p-5 hover:shadow-md transition-shadow flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-500">Your team</p>
            {reportsDue + reportsNoCadence > 0 ? (
              <>
                <p className={clsx('text-2xl font-bold', reportsDue > 0 ? 'text-red-600' : 'text-navy-900')}>
                  {reportsDue + reportsNoCadence} to check in
                </p>
                <p className="text-sm text-gray-500">
                  {[reportsDue > 0 && `${reportsDue} due`, reportsNoCadence > 0 && `${reportsNoCadence} not set up`].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-navy-900">All caught up</p>
                <p className="text-sm text-gray-500">{reportsTotal} {reportsTotal === 1 ? 'person' : 'people'} on track</p>
              </>
            )}
            <span className="text-sm text-navy-700 font-medium mt-auto pt-1">View your team →</span>
          </Link>
        ) : myDept ? (
          <Link href="/dashboard/workspaces/department" className="card p-5 hover:shadow-md transition-shadow flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-500">Your department</p>
            <p className="text-2xl font-bold text-navy-900">{myDept}</p>
            <p className="text-sm text-gray-500">{deptCount > 0 ? `${deptCount} ${deptCount === 1 ? 'person' : 'people'}` : 'Shared space'}</p>
            <span className="text-sm text-navy-700 font-medium mt-auto pt-1">Open department space →</span>
          </Link>
        ) : null}
      </div>
    </section>
  )
}
