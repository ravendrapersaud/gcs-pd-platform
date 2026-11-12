'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CheckInFrequency } from '@/lib/types'
import { nextDueDate, isOverdue, todayISO } from '@/lib/checkins'
import clsx from 'clsx'

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

type SchedRow = { employee_id: string; frequency: CheckInFrequency; active: boolean; start_date: string }

// A compact "Your 1:1s" row for the dashboard: your next check-in + open
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

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: sched }, { data: resp }, { count: openCount }, { data: assigns }] = await Promise.all([
      supabase.from('check_in_schedules').select('employee_id, frequency, active, start_date').eq('employee_id', user.id).maybeSingle(),
      supabase.from('form_responses').select('submitted_at, template:form_templates(category)').eq('subject_id', user.id).eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('check_in_follow_ups').select('id', { count: 'exact', head: true }).eq('employee_id', user.id).eq('status', 'open'),
      supabase.from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id),
    ])

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
      for (const s of (rSched ?? []) as SchedRow[]) {
        const nd = nextDueDate({ frequency: s.frequency, active: s.active, lastCheckIn: lastBy.get(s.employee_id) ?? null, startDate: s.start_date })
        if (nd && nd <= today) due += 1
      }
      setReportsDue(due)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="card h-24 animate-pulse bg-gray-100" />

  const myNext = mySched ? nextDueDate({ frequency: mySched.frequency, active: mySched.active, lastCheckIn: myLast, startDate: mySched.start_date }) : null
  const myOverdue = isOverdue(myNext)

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-gray-900 text-lg">Your 1:1s</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Your next check-in */}
        <Link href="/dashboard/portfolio/me#one-on-one" className="card p-5 hover:shadow-md transition-shadow flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-gray-400">Your next check-in</p>
          {!mySched ? (
            <p className="text-lg font-display text-navy-800">No rhythm set yet</p>
          ) : myNext ? (
            <p className={clsx('text-lg font-display', myOverdue ? 'text-red-600' : 'text-navy-800')}>
              {myOverdue ? 'Due now' : `Due ${fmtDate(myNext)}`}
            </p>
          ) : (
            <p className="text-lg font-display text-navy-800">No set cadence</p>
          )}
          <p className="text-sm text-gray-500">
            {myOpen > 0 ? <span className={myOverdue ? '' : 'text-gray-700 font-medium'}>{myOpen} follow-up{myOpen === 1 ? '' : 's'} open</span> : 'No open follow-ups'}
          </p>
          <span className="text-sm text-navy-700 font-medium mt-auto pt-1">{mySched ? 'Open your 1:1 →' : 'Set up your 1:1 →'}</span>
        </Link>

        {/* Reports due (supervisors) */}
        {reportsTotal > 0 && (
          <Link href="/dashboard/goals?tab=team" className="card p-5 hover:shadow-md transition-shadow flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">Reports to check in</p>
            {reportsDue > 0 ? (
              <>
                <p className="text-lg font-display text-red-600">{reportsDue} due now</p>
                <p className="text-sm text-gray-500">of {reportsTotal} {reportsTotal === 1 ? 'report' : 'reports'}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-display text-navy-800">All caught up</p>
                <p className="text-sm text-gray-500">{reportsTotal} {reportsTotal === 1 ? 'report' : 'reports'} on track</p>
              </>
            )}
            <span className="text-sm text-navy-700 font-medium mt-auto pt-1">View your team →</span>
          </Link>
        )}
      </div>
    </section>
  )
}
