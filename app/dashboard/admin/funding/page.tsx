'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FundingRequest, PdActivity, Profile, FundingStatus } from '@/lib/types'
import {
  FALLBACK_FUND_CONFIG, parseFundSettings, effectiveAllotment, usedAllotment, drawsFromAllotment,
  isInFundYear, fundYearLabel, fundYearRange, formatUSD,
  FUND_SOURCES, FUND_SOURCE_LABELS, COST_CATEGORIES, COST_CATEGORY_LABELS,
  type FundConfig, type FundSource, type CostCategory,
} from '@/lib/funds'
import clsx from 'clsx'

const nameOf = (p?: Pick<Profile, 'first_name' | 'last_name'> | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown'

const STATUSES: FundingStatus[] = ['approved', 'pending', 'denied', 'cancelled']

const blankForm = {
  title: '', amount: '', category: '' as '' | CostCategory, fund_source: 'personal' as FundSource,
  pd_activity_id: '', status: 'approved' as FundingStatus, description: '',
}

export default function AdminFundingPage() {
  const supabase = createClient()

  const [me, setMe] = useState<Profile | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [people, setPeople] = useState<Profile[]>([])
  const [cfg, setCfg] = useState<FundConfig>(FALLBACK_FUND_CONFIG)

  const [picker, setPicker] = useState('')
  const [person, setPerson] = useState<Profile | null>(null)
  const [requests, setRequests] = useState<FundingRequest[]>([])
  const [activities, setActivities] = useState<Pick<PdActivity, 'id' | 'title'>[]>([])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', fund_source: 'personal' as FundSource, category: '' as '' | CostCategory, status: 'approved' as FundingStatus })

  // ── Initial load: me + roster + settings ────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }
      const [{ data: prof }, { data: roster }, { data: settings }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('profiles').select('id, first_name, last_name, title, email, employee_type, pd_allotment').order('last_name'),
        supabase.from('app_settings').select('key, value'),
      ])
      const p = (prof ?? null) as Profile | null
      setMe(p)
      setCanManage(p?.role === 'admin' || p?.can_manage_funds === true)
      setPeople((roster ?? []) as Profile[])
      setCfg(parseFundSettings(settings))
      setReady(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load one person's funding + activities ──────────────────
  const loadPerson = useCallback(async (p: Profile) => {
    setPerson(p); setPicker(''); setError(null); setNotice(null); setShowForm(false); setEditId(null)
    const [{ data: reqs }, { data: acts }] = await Promise.all([
      supabase.from('funding_requests').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
      supabase.from('pd_activities').select('id, title').eq('user_id', p.id).order('activity_date', { ascending: false }),
    ])
    setRequests((reqs ?? []) as FundingRequest[])
    setActivities((acts ?? []) as Pick<PdActivity, 'id' | 'title'>[])
  }, [])

  const reloadPerson = useCallback(async () => { if (person) await loadPerson(person) }, [person, loadPerson])

  const pickerMatches = picker.trim().length < 2 ? [] : people
    .filter((p) => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(picker.trim().toLowerCase()))
    .slice(0, 8)

  // ── Add a cost line ─────────────────────────────────────────
  const addCost = async () => {
    if (!me || !person) return
    const amount = parseFloat(form.amount)
    if (!form.title.trim()) { setError('Give the cost a title.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount.'); return }
    setBusy(true); setError(null); setNotice(null)
    const approved = form.status === 'approved'
    const { data, error: e } = await supabase.from('funding_requests').insert({
      user_id: person.id,
      title: form.title.trim(),
      amount,
      description: form.description.trim() || null,
      category: form.category || null,
      fund_source: form.fund_source,
      pd_activity_id: form.pd_activity_id || null,
      status: form.status,
      admin_entered: true,
      created_by: me.id,
      reviewed_by: approved ? me.id : null,
      reviewed_at: approved ? new Date().toISOString() : null,
    }).select()
    if (e || !data || data.length === 0) {
      setError(`Could not add the cost: ${e?.message ?? 'no row returned (check permissions)'}`)
      setBusy(false); return
    }
    setForm(blankForm); setShowForm(false); setBusy(false)
    setNotice(`Added ${formatUSD(amount)} for ${nameOf(person)}.`)
    reloadPerson()
  }

  // ── Edit / delete a line ────────────────────────────────────
  const startEdit = (fr: FundingRequest) => {
    setEditId(fr.id)
    setEditForm({
      amount: String(fr.amount), fund_source: (fr.fund_source as FundSource) ?? 'personal',
      category: (fr.category as CostCategory) ?? '', status: fr.status,
    })
  }
  const saveEdit = async () => {
    if (!me || !editId) return
    const amount = parseFloat(editForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount.'); return }
    setBusy(true); setError(null); setNotice(null)
    const approved = editForm.status === 'approved'
    const { data, error: e } = await supabase.from('funding_requests').update({
      amount, fund_source: editForm.fund_source, category: editForm.category || null, status: editForm.status,
      ...(approved ? { reviewed_by: me.id, reviewed_at: new Date().toISOString() } : {}),
    }).eq('id', editId).select()
    if (e || !data || data.length === 0) { setError(`Could not save: ${e?.message ?? 'no row changed'}`); setBusy(false); return }
    setEditId(null); setBusy(false); reloadPerson()
  }
  const delCost = async (fr: FundingRequest) => {
    if (!confirm(`Delete "${fr.title}" (${formatUSD(Number(fr.amount))}) from ${nameOf(person)}'s record?`)) return
    setBusy(true); setError(null); setNotice(null)
    const { error: e } = await supabase.from('funding_requests').delete().eq('id', fr.id)
    if (e) { setError(`Could not delete: ${e.message}`); setBusy(false); return }
    setBusy(false); reloadPerson()
  }

  if (!ready) return <div className="card h-48 animate-pulse bg-gray-100" />
  if (!canManage) return <div className="card p-6 text-sm text-gray-600">You don’t have access to PD funding management.</div>

  // ── Derived figures for the selected person ─────────────────
  const allotment = person ? effectiveAllotment(person, cfg) : 0
  const thisYear = requests.filter((fr) => isInFundYear(fr.created_at, person?.employee_type, cfg))
  const used = person ? usedAllotment(requests, person.employee_type, cfg) : 0
  const pending = thisYear.filter((fr) => fr.status === 'pending' && drawsFromAllotment(fr.fund_source)).reduce((s, fr) => s + Number(fr.amount), 0)
  const offAllotment = thisYear.filter((fr) => fr.status === 'approved' && !drawsFromAllotment(fr.fund_source)).reduce((s, fr) => s + Number(fr.amount), 0)
  const remaining = Math.max(allotment - used, 0)
  const addDraws = drawsFromAllotment(form.fund_source)

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {notice && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{notice}</div>}

      {/* Person picker */}
      <div className="card p-5 space-y-3">
        <label className="label">Whose PD funding?</label>
        <input className="input" placeholder="Search staff by name or email…" value={picker} onChange={(e) => setPicker(e.target.value)} />
        {pickerMatches.length > 0 && (
          <ul className="border border-gray-200 rounded-lg divide-y">
            {pickerMatches.map((p) => (
              <li key={p.id}>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => loadPerson(p)}>
                  {nameOf(p)} <span className="text-gray-400">· {p.title ?? p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!person ? (
        <p className="text-sm text-gray-400">Pick a person to view and adjust their PD funding.</p>
      ) : (
        <>
          {/* Fund summary */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-gray-500">{nameOf(person)} · PD fund allotment · {fundYearLabel(person.employee_type, cfg)}</p>
                <p className="text-3xl font-bold text-navy-900 mt-1">{formatUSD(remaining)} <span className="text-base font-medium text-gray-400">remaining</span></p>
                <p className="text-xs text-gray-400 mt-1">Resets to {formatUSD(allotment)} on {fundYearRange(person.employee_type, cfg).start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div><p className="text-gray-400">Allotment</p><p className="font-semibold text-gray-700">{formatUSD(allotment)}</p></div>
                <div><p className="text-gray-400">Used (personal)</p><p className="font-semibold text-gray-700">{formatUSD(used)}</p></div>
                <div><p className="text-gray-400">Pending</p><p className="font-semibold text-yellow-600">{formatUSD(pending)}</p></div>
                <div><p className="text-gray-400">Off-allotment</p><p className="font-semibold text-green-700">{formatUSD(offAllotment)}</p></div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary text-sm" onClick={() => { setShowForm((v) => !v); setForm(blankForm) }}>
              {showForm ? 'Cancel' : '+ Add cost'}
            </button>
          </div>

          {/* Add cost form */}
          {showForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Add a cost to {nameOf(person)}’s PD</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">What was it?</label>
                  <input className="input" placeholder="e.g. Per-diem — ASCD conference" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Amount ($)</label>
                  <input type="number" step="0.01" min="0.01" className="input" placeholder="75.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CostCategory | '' })}>
                    <option value="">—</option>
                    {COST_CATEGORIES.map((c) => <option key={c} value={c}>{COST_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Fund source</label>
                  <select className="input" value={form.fund_source} onChange={(e) => setForm({ ...form, fund_source: e.target.value as FundSource })}>
                    {FUND_SOURCES.map((s) => <option key={s} value={s}>{FUND_SOURCE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FundingStatus })}>
                    {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Link to a PD activity (optional)</label>
                  <select className="input" value={form.pd_activity_id} onChange={(e) => setForm({ ...form, pd_activity_id: e.target.value })}>
                    <option value="">None</option>
                    {activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Note (optional)</label>
                  <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <div className={clsx('rounded-lg px-3 py-2 text-sm', addDraws ? 'bg-navy-50 text-navy-800' : 'bg-green-50 text-green-800')}>
                {addDraws
                  ? `Counts toward ${nameOf(person)}’s $${allotment.toLocaleString()} allotment.`
                  : `Counts as PD, but does NOT draw from the allotment (paid by ${FUND_SOURCE_LABELS[form.fund_source]}).`}
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn-primary" disabled={busy} onClick={addCost}>Add cost</button>
              </div>
            </div>
          )}

          {/* Existing lines */}
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400">No funding on record yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((fr) => {
                const draws = drawsFromAllotment(fr.fund_source)
                return (
                  <div key={fr.id} className="card p-5">
                    {editId === fr.id ? (
                      <div className="space-y-3">
                        <p className="font-semibold text-gray-900">{fr.title}</p>
                        <div className="grid sm:grid-cols-4 gap-3">
                          <div><label className="label">Amount</label><input type="number" step="0.01" className="input" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
                          <div>
                            <label className="label">Category</label>
                            <select className="input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as CostCategory | '' })}>
                              <option value="">—</option>
                              {COST_CATEGORIES.map((c) => <option key={c} value={c}>{COST_CATEGORY_LABELS[c]}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label">Source</label>
                            <select className="input" value={editForm.fund_source} onChange={(e) => setEditForm({ ...editForm, fund_source: e.target.value as FundSource })}>
                              {FUND_SOURCES.map((s) => <option key={s} value={s}>{FUND_SOURCE_LABELS[s]}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label">Status</label>
                            <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as FundingStatus })}>
                              {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary text-sm" onClick={() => setEditId(null)}>Cancel</button>
                          <button className="btn-primary text-sm" disabled={busy} onClick={saveEdit}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{fr.title}</p>
                            {fr.category && <span className="badge badge-gray text-xs">{COST_CATEGORY_LABELS[fr.category as CostCategory] ?? fr.category}</span>}
                            {!draws && <span className="badge badge-green text-xs">Paid by {FUND_SOURCE_LABELS[fr.fund_source as FundSource] ?? fr.fund_source}</span>}
                            {fr.admin_entered && <span className="badge badge-gray text-xs">Admin-entered</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(fr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {draws ? ' · counts toward allotment' : ' · off-allotment'}
                          </p>
                          {fr.description && <p className="text-sm text-gray-600 mt-1">{fr.description}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-navy-900">{formatUSD(Number(fr.amount))}</p>
                          <span className={clsx('badge mt-1',
                            fr.status === 'approved' ? 'badge-green' : fr.status === 'pending' ? 'badge-yellow' : fr.status === 'denied' ? 'badge-red' : 'badge-gray')}>
                            {fr.status}
                          </span>
                          <div className="flex gap-2 mt-2 justify-end">
                            <button className="btn-ghost text-xs" disabled={busy} onClick={() => startEdit(fr)}>Edit</button>
                            <button className="btn-ghost text-xs text-red-600" disabled={busy} onClick={() => delCost(fr)}>Delete</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
