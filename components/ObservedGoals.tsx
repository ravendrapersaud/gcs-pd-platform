'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ActiveGoal = {
  id: string
  title: string
  goal_type: 'standard' | 'faculty_inquiry'
  progress_pct: number
  due_date: string | null
}

// Read-only panel of the observed person's active goals, shown on the
// observation forms so the observer knows what the teacher is working toward.
// Fetches through /api/user-goals (service-role, auth-gated) so it works for
// peers and formal observers alike without loosening the goals RLS policy.
export default function ObservedGoals({
  personId,
  personName,
}: {
  personId: string | null
  personName?: string
}) {
  const supabase = createClient()
  const [goals, setGoals] = useState<ActiveGoal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!personId) { setGoals([]); setError(null); return }
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/user-goals?userId=${encodeURIComponent(personId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setError(body.error || 'Could not load goals.'); setGoals([]); return }
        setGoals((body.goals ?? []) as ActiveGoal[])
      } catch {
        if (!cancelled) { setError('Could not load goals.'); setGoals([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [personId])

  if (!personId) return null

  const first = personName?.trim()?.split(/\s+/)[0]
  const heading = first ? `${first}’s current goals` : 'Current goals'

  return (
    <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900">{heading}</h3>
        <span className="text-xs text-gray-400">For context</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 mt-2">Loading goals…</p>
      ) : error ? (
        <p className="text-sm text-gray-500 mt-2">{error}</p>
      ) : goals.length === 0 ? (
        <p className="text-sm text-gray-500 mt-2">No active goals on record.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="flex items-start gap-2 text-sm">
              <span className={`badge ${g.goal_type === 'faculty_inquiry' ? 'badge-navy' : 'badge-gray'} shrink-0 mt-0.5`}>
                {g.goal_type === 'faculty_inquiry' ? 'Inquiry' : 'Goal'}
              </span>
              <div className="min-w-0">
                <p className="text-gray-800">{g.title}</p>
                <p className="text-xs text-gray-400">
                  {g.progress_pct}% complete
                  {g.due_date ? ` · due ${new Date(`${g.due_date}T12:00:00`).toLocaleDateString()}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
