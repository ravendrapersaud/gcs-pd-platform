'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Cohort, CohortSession, CohortTask } from '@/lib/types'
import { checklistProgress, nextSession, formatSessionDate, formatTimeRange } from '@/lib/cohorts'

// A prominent "New Faculty" banner on the dashboard home — shown ONLY to members
// of an active cohort. Checklist progress + next session, linking to the cohort
// home. Renders nothing for everyone else, so the normal dashboard is unchanged.
export default function CohortHero() {
  const supabase = createClient()
  const [cohort, setCohort] = useState<Cohort | null>(null)
  const [tasks, setTasks] = useState<CohortTask[]>([])
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [next, setNext] = useState<CohortSession | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setReady(true); return }

    const { data: mine } = await supabase
      .from('cohort_members')
      .select('cohort:cohorts(*)')
      .eq('user_id', user.id)
    const active = (mine ?? [])
      .map((r) => (r as unknown as { cohort: Cohort }).cohort)
      .filter((c) => c && c.is_active)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null

    if (!active) { setReady(true); return }
    setCohort(active)

    const [{ data: tsk }, { data: comp }, { data: sess }] = await Promise.all([
      supabase.from('cohort_tasks').select('id').eq('cohort_id', active.id),
      supabase.from('cohort_task_completions').select('task_id').eq('user_id', user.id),
      supabase.from('cohort_sessions').select('*').eq('cohort_id', active.id),
    ])
    setTasks((tsk ?? []) as CohortTask[])
    setDoneIds(((comp ?? []) as { task_id: string }[]).map((c) => c.task_id))
    setNext(nextSession((sess ?? []) as CohortSession[]))
    setReady(true)
  }, [])
  useEffect(() => { load() }, [load])

  if (!ready || !cohort) return null

  const prog = checklistProgress(tasks, doneIds)

  return (
    <Link href="/dashboard/cohort" className="block card p-0 overflow-hidden hover:shadow-md transition-shadow">
      <div className="bg-gradient-to-r from-navy-900 to-navy-800 px-5 py-4 sm:flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-navy-200 text-[11px] font-semibold uppercase tracking-widest">New Faculty</p>
          <h2 className="font-display font-bold text-white text-lg truncate">{cohort.name}</h2>
          <p className="text-navy-200 text-sm mt-0.5">
            {next
              ? <>Next: <span className="text-white">{next.title}</span> · {formatSessionDate(next.session_date)}{formatTimeRange(next.start_time, next.end_time) && ` · ${formatTimeRange(next.start_time, next.end_time)}`}</>
              : 'Your onboarding home'}
          </p>
        </div>
        <div className="mt-3 sm:mt-0 shrink-0 sm:text-right">
          <div className="flex items-center gap-2 sm:justify-end">
            <div className="w-28 bg-white/15 rounded-full h-2">
              <div className="h-2 rounded-full bg-grace-green" style={{ width: `${prog.pct}%` }} />
            </div>
            <span className="text-white text-sm font-medium">{prog.pct}%</span>
          </div>
          <span className="text-navy-100 text-xs">{prog.done}/{prog.total} checklist · Open →</span>
        </div>
      </div>
    </Link>
  )
}
