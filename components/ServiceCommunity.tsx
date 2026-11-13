'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ServiceEntry, ServiceTimeframe } from '@/lib/types'
import { termsFor, type TaxonomyTerm } from '@/lib/taxonomyDb'
import clsx from 'clsx'

// Service & Community (v1): a qualitative, self-owned log of community engagement.
// Loads client-side so RLS enforces the private tier + division-scoped admin
// access. The owner (and designated admins, on a person's behalf) can add/edit/
// remove; shared entries are visible to supervisors + designated admins.

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const TIMEFRAMES: { value: ServiceTimeframe; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'school_year', label: 'This year' },
  { value: 'one_off', label: 'One-off' },
]
const timeframeLabel = (t: ServiceTimeframe) => TIMEFRAMES.find((x) => x.value === t)?.label ?? t

const BLANK = { title: '', service_type: '', role: '', timeframe: 'school_year' as ServiceTimeframe, on_date: '', reflection: '', link: '', is_private: false }
const normalizeUrl = (raw: string) => {
  const t = raw.trim()
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export default function ServiceCommunity({ subjectId, subjectFirstName, year, isSelf }: { subjectId: string; subjectFirstName: string; year: number; isSelf: boolean }) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [{ data: me }, { data: rows }, { data: terms }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('service_entries')
        .select('*, creator:profiles!service_entries_created_by_fkey(first_name, last_name)')
        .eq('subject_id', subjectId).eq('school_year_start', year)
        .order('created_at', { ascending: false }),
      supabase.from('taxonomy_terms').select('*').eq('category', 'service_type').order('sort_order'),
    ])
    setRole((me?.role as string) ?? null)
    setEntries((rows ?? []) as unknown as ServiceEntry[])
    setTypes(termsFor((terms ?? []) as TaxonomyTerm[], 'service_type'))
    setLoading(false)
  }, [subjectId, year])
  useEffect(() => { load() }, [load])

  const canManage = isSelf || role === 'admin'

  const resetForm = () => { setForm({ ...BLANK }); setEditingId(null); setShowForm(false) }

  const save = async () => {
    if (!form.title.trim() || !userId) return
    setBusy(true); setError(null)
    const payload = {
      title: form.title.trim(),
      service_type: form.service_type || null,
      role: form.role.trim() || null,
      timeframe: form.timeframe,
      on_date: form.timeframe === 'one_off' && form.on_date ? form.on_date : null,
      reflection: form.reflection.trim() || null,
      link: normalizeUrl(form.link),
      visibility: form.is_private ? 'private' : 'shared',
    }
    const res = editingId
      ? await supabase.from('service_entries').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId).select('id')
      : await supabase.from('service_entries').insert({ ...payload, subject_id: subjectId, created_by: userId, school_year_start: year }).select('id')
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    if (!res.data || res.data.length === 0) { setError('Could not save (you may not have permission).'); return }
    resetForm(); load()
  }

  const startEdit = (e: ServiceEntry) => {
    setEditingId(e.id)
    setForm({
      title: e.title, service_type: e.service_type ?? '', role: e.role ?? '',
      timeframe: e.timeframe, on_date: e.on_date ?? '', reflection: e.reflection ?? '',
      link: e.link ?? '', is_private: e.visibility === 'private',
    })
    setShowForm(true)
  }

  const remove = async (id: string) => {
    const { error: err } = await supabase.from('service_entries').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading) return <div className="card h-28 animate-pulse bg-gray-100" />
  // Hide entirely from non-managers when there's nothing to show.
  if (entries.length === 0 && !canManage) return null

  // Group by service type for display.
  const byType = new Map<string, ServiceEntry[]>()
  for (const e of entries) {
    const k = e.service_type || 'Other'
    byType.set(k, [...(byType.get(k) ?? []), e])
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Service &amp; Community <span className="text-gray-400 font-normal">({entries.length})</span></h3>
          <p className="text-xs text-gray-400">Committees, groups, events, and volunteering — {isSelf ? 'the work you do' : `the work ${subjectFirstName} does`} beyond the role.</p>
        </div>
        {canManage && !showForm && (
          <button onClick={() => { setForm({ ...BLANK }); setEditingId(null); setShowForm(true) }} className="btn-secondary text-xs shrink-0">Add</button>
        )}
      </div>

      {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {showForm && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <input className="input text-sm" placeholder="What did you contribute to? (e.g. DEI Committee, AV for the play)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                <option value="">—</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Role <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="input" placeholder="member / chair / volunteer…" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
            <div>
              <label className="label">When</label>
              <select className="input" value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value as ServiceTimeframe })}>
                {TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.timeframe === 'one_off' && (
              <div>
                <label className="label">Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" className="input" value={form.on_date} onChange={(e) => setForm({ ...form, on_date: e.target.value })} />
              </div>
            )}
          </div>
          <textarea rows={2} className="input text-sm resize-none" placeholder="A sentence on what it was / what you contributed (optional)" value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} />
          <input className="input text-sm" placeholder="Link (optional) — a doc, sign-up, or program" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} /> Keep private (just me)
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !form.title.trim()} className="btn-primary text-sm">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add'}</button>
              <button onClick={resetForm} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">{isSelf ? 'Nothing logged yet — add a committee, group, event, or anything you volunteered for.' : 'Nothing logged yet.'}</p>
      ) : (
        <div className="space-y-3">
          {[...byType.entries()].map(([type, list]) => (
            <div key={type} className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-gray-400">{type}</p>
              {list.map((e) => (
                <div key={e.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {e.title}
                        {e.visibility === 'private' && <span className="badge badge-gray text-[10px] ml-2">private</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {e.role ? `${e.role} · ` : ''}{timeframeLabel(e.timeframe)}{e.timeframe === 'one_off' && e.on_date ? ` · ${fmtDate(e.on_date)}` : ''}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => startEdit(e)} className="text-xs text-navy-700 hover:underline">Edit</button>
                        <button onClick={() => remove(e.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                      </div>
                    )}
                  </div>
                  {e.reflection && <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1.5">{e.reflection}</p>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                    {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-xs text-navy-700 hover:underline">Open link →</a>}
                    {e.created_by && e.created_by !== e.subject_id && e.creator && (
                      <span className="text-[11px] text-gray-400">added by {e.creator.first_name} {e.creator.last_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
