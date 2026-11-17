'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuditLog } from '@/lib/types'

const nameOf = (p?: { first_name: string; last_name: string } | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : 'an administrator'

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// "Changes to your record" — the admin actions that touched THIS person's
// record (funding decisions, allotment/role/flag changes). RLS lets the person
// read their own entries, and admins read anyone's. Renders nothing when empty.
export default function RecordActivity({ subjectId, selfView = true }: { subjectId: string; selfView?: boolean }) {
  const supabase = createClient()
  const [rows, setRows] = useState<AuditLog[]>([])
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    supabase
      .from('audit_log')
      .select('*, actor:profiles!audit_log_actor_id_fkey(first_name,last_name)')
      .eq('target_user_id', subjectId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (active) { setRows((data ?? []) as AuditLog[]); setReady(true) } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  if (!ready || rows.length === 0) return null

  return (
    <section className="card p-5">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="text-left">
          <h2 className="font-display font-bold text-navy-900">{selfView ? 'Changes to your record' : 'Changes to this record'}</h2>
          <p className="text-xs text-gray-500">Administrative actions on {selfView ? 'your' : 'this'} funding, allotment, and account — for transparency.</p>
        </div>
        <span className="text-sm text-navy-700 shrink-0">{open ? 'Hide' : `Show (${rows.length})`}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-100 p-3">
              <p className="text-sm text-gray-700">{r.summary}</p>
              <p className="text-xs text-gray-400 mt-1">by {nameOf(r.actor)} · {fmtWhen(r.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
