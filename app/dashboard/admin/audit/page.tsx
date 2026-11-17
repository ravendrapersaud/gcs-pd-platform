'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuditLog, Profile } from '@/lib/types'
import clsx from 'clsx'

const nameOf = (p?: { first_name: string; last_name: string } | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : null

const CATEGORIES: { key: string; label: string; match: (a: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'profile', label: 'Profiles', match: (a) => a.startsWith('profile.') },
  { key: 'funding', label: 'Funding', match: (a) => a.startsWith('funding.') },
  { key: 'settings', label: 'Settings', match: (a) => a.startsWith('settings.') },
]

const actionBadge = (action: string) =>
  action.startsWith('funding') ? 'badge-green'
    : action.startsWith('profile') ? 'badge-navy'
    : action.startsWith('settings') ? 'badge-yellow' : 'badge-gray'

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function ChangeDiff({ changes }: { changes: AuditLog['changes'] }) {
  if (!changes || Object.keys(changes).length === 0) return null
  const show = (v: unknown) => v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return (
    <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs space-y-1">
      {Object.entries(changes).map(([field, d]) => (
        <div key={field} className="flex gap-2">
          <span className="font-medium text-gray-600 w-40 shrink-0">{field}</span>
          <span className="text-gray-500">{show(d?.from)}</span>
          <span className="text-gray-400">→</span>
          <span className="text-gray-800">{show(d?.to)}</span>
        </div>
      ))}
    </div>
  )
}

export default function AuditLogPage() {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState<AuditLog[]>([])
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setReady(true); return }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = (prof as Pick<Profile, 'role'> | null)?.role === 'admin'
    setIsAdmin(admin)
    if (admin) {
      const { data } = await supabase
        .from('audit_log')
        .select('*, actor:profiles!audit_log_actor_id_fkey(first_name,last_name), target_user:profiles!audit_log_target_user_id_fkey(first_name,last_name)')
        .order('created_at', { ascending: false })
        .limit(400)
      setRows((data ?? []) as AuditLog[])
    }
    setReady(true)
  }, [])
  useEffect(() => { load() }, [load])

  if (!ready) return <div className="card h-48 animate-pulse bg-gray-100" />
  if (!isAdmin) return <div className="card p-6 text-sm text-gray-600">The audit log is available to administrators.</div>

  const matchCat = CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0]
  const query = q.trim().toLowerCase()
  const filtered = rows.filter((r) => matchCat.match(r.action) && (
    query === '' ||
    (r.summary ?? '').toLowerCase().includes(query) ||
    (nameOf(r.actor) ?? '').toLowerCase().includes(query) ||
    (nameOf(r.target_user) ?? '').toLowerCase().includes(query)
  ))

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        An append-only record of privileged actions — profile changes, funding decisions, and school-wide settings. Entries are stamped with the real actor and can’t be edited or removed.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)} className={clsx('tab', cat === c.key ? 'tab-active' : 'tab-inactive')}>{c.label}</button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Search person or detail…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-gray-400">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No audit entries{rows.length > 0 ? ' match your filters' : ' yet'}.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const actor = nameOf(r.actor) ?? 'System'
            const who = r.target_user_id ? (nameOf(r.target_user) ?? 'a person') : 'School-wide'
            const open = expanded === r.id
            const hasDiff = r.changes && Object.keys(r.changes).length > 0
            return (
              <div key={r.id} className="card p-4">
                <button
                  className={clsx('w-full text-left flex items-start justify-between gap-3', hasDiff && 'cursor-pointer')}
                  onClick={() => hasDiff && setExpanded(open ? null : r.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('badge text-[10px]', actionBadge(r.action))}>{r.action}</span>
                      <span className="text-sm font-medium text-gray-900">{who}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{r.summary}</p>
                    <p className="text-xs text-gray-400 mt-1">by {actor} · {fmtWhen(r.created_at)}</p>
                  </div>
                  {hasDiff && <span className="text-gray-400 text-xs shrink-0 mt-1">{open ? 'Hide' : 'Details'}</span>}
                </button>
                {open && <ChangeDiff changes={r.changes} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
