'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { createClient } from '@/lib/supabase/client'
import type {
  Cohort, CohortMember, CohortSession, CohortTask, CohortSlot, CohortSlotSignup, Profile,
} from '@/lib/types'
import {
  SLOT_KINDS, SLOT_KIND_LABELS, campusLabel, checklistProgress,
  formatSessionDate, formatTimeRange, dateParts,
} from '@/lib/cohorts'

type Tab = 'roster' | 'schedule' | 'checklist' | 'slots' | 'progress'
const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'slots', label: 'Slots' },
  { key: 'progress', label: 'Progress' },
]

const nameOf = (p?: Profile | null) => (p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown')

export default function CohortDetailPage() {
  const supabase = createClient()
  const { id } = useParams<{ id: string }>()

  const [me, setMe] = useState<Profile | null>(null)
  const [cohort, setCohort] = useState<Cohort | null>(null)
  const [members, setMembers] = useState<CohortMember[]>([])
  const [sessions, setSessions] = useState<CohortSession[]>([])
  const [tasks, setTasks] = useState<CohortTask[]>([])
  const [slots, setSlots] = useState<CohortSlot[]>([])
  const [signups, setSignups] = useState<CohortSlotSignup[]>([])
  const [completions, setCompletions] = useState<{ task_id: string; user_id: string }[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])

  const [tab, setTab] = useState<Tab>('roster')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const profById = (uid: string) => allProfiles.find((p) => p.id === uid)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [
      { data: prof }, { data: co, error: coErr }, { data: mem }, { data: sess },
      { data: tsk }, { data: slt }, { data: sgn }, { data: comp }, { data: profs },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('cohorts').select('*').eq('id', id).single(),
      supabase.from('cohort_members').select('*').eq('cohort_id', id),
      supabase.from('cohort_sessions').select('*').eq('cohort_id', id).order('session_date', { nullsFirst: false }),
      supabase.from('cohort_tasks').select('*').eq('cohort_id', id).order('sort_order'),
      supabase.from('cohort_slots').select('*').eq('cohort_id', id).order('slot_date', { nullsFirst: false }),
      supabase.from('cohort_slot_signups').select('*'),
      supabase.from('cohort_task_completions').select('task_id, user_id'),
      supabase.from('profiles').select('id, first_name, last_name, email, title, avatar_url').order('last_name'),
    ])

    if (coErr) setError(`Failed to load cohort: ${coErr.message}`)

    setMe((prof ?? null) as Profile | null)
    setCohort((co ?? null) as Cohort | null)
    setMembers((mem ?? []) as CohortMember[])
    setSessions((sess ?? []) as CohortSession[])
    setTasks((tsk ?? []) as CohortTask[])
    setSlots((slt ?? []) as CohortSlot[])
    setSignups((sgn ?? []) as CohortSlotSignup[])
    setCompletions((comp ?? []) as { task_id: string; user_id: string }[])
    setAllProfiles((profs ?? []) as Profile[])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const fail = (label: string, e: { message: string } | null) => {
    setError(`${label}: ${e?.message ?? 'no rows changed — you may not have permission.'}`)
  }
  const ok = (msg: string) => { setError(null); setNotice(msg) }

  // ── Roster ──────────────────────────────────────────────────
  const [picker, setPicker] = useState('')
  const memberIds = new Set(members.map((m) => m.user_id))
  const pickerMatches = picker.trim().length < 2 ? [] : allProfiles
    .filter((p) => !memberIds.has(p.id))
    .filter((p) => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(picker.trim().toLowerCase()))
    .slice(0, 6)

  const addMember = async (uid: string) => {
    if (!me) return
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase
      .from('cohort_members')
      .insert({ cohort_id: id, user_id: uid, member_role: 'member', added_by: me.id })
      .select()
    if (e || !data || data.length === 0) { fail('Could not add member', e); setBusy(false); return }
    await supabase.rpc('sync_cohort_workspace', { c: id })
    setPicker('')
    ok(`${nameOf(profById(uid))} added.`)
    setBusy(false); load()
  }

  const toggleFacilitator = async (m: CohortMember) => {
    setBusy(true); setError(null); setNotice(null)
    const next = m.member_role === 'facilitator' ? 'member' : 'facilitator'
    const { data, error: e } = await supabase
      .from('cohort_members')
      .update({ member_role: next })
      .eq('cohort_id', id).eq('user_id', m.user_id)
      .select()
    if (e || !data || data.length === 0) { fail('Could not update role', e); setBusy(false); return }
    await supabase.rpc('sync_cohort_workspace', { c: id })
    setBusy(false); load()
  }

  const removeMember = async (m: CohortMember) => {
    if (!confirm(`Remove ${nameOf(profById(m.user_id))} from this cohort? They’ll also leave the cohort workspace.`)) return
    setBusy(true); setError(null); setNotice(null)
    const { error: e } = await supabase
      .from('cohort_members').delete().eq('cohort_id', id).eq('user_id', m.user_id)
    if (e) { fail('Could not remove member', e); setBusy(false); return }
    await supabase.rpc('sync_cohort_workspace', { c: id })
    setBusy(false); load()
  }

  const deleteCohort = async () => {
    if (!cohort) return
    if (!confirm(`Permanently delete "${cohort.name}" — all its sessions, checklist, slots, and roster — and its shared workspace? This cannot be undone.`)) return
    setBusy(true); setError(null); setNotice(null)
    const wsId = cohort.workspace_id
    const { error: e } = await supabase.from('cohorts').delete().eq('id', id)
    if (e) { fail('Could not delete cohort', e); setBusy(false); return }
    if (wsId) await supabase.from('workspaces').delete().eq('id', wsId)
    window.location.href = '/dashboard/cohorts'
  }

  const sendWelcome = async (m: CohortMember) => {
    const who = nameOf(profById(m.user_id))
    if (!confirm(`Send a welcome email to ${who}?`)) return
    setBusy(true); setError(null); setNotice(null)
    const res = await fetch('/api/cohort/welcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohort_id: id, user_id: m.user_id }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Could not send welcome.'); return }
    if (json.email === 'sent') ok(`Welcome email sent to ${who}.`)
    else if (json.email === 'skipped') setNotice('Email isn’t configured, so nothing was sent.')
    else setError(`Email ${json.email}${json.error ? `: ${json.error}` : ''}.`)
  }

  // ── Generic delete ──────────────────────────────────────────
  const del = async (table: string, match: Record<string, string>, label: string) => {
    setBusy(true); setError(null); setNotice(null)
    let q = supabase.from(table).delete()
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
    const { error: e } = await q
    if (e) { fail(`Could not delete ${label}`, e); setBusy(false); return }
    setBusy(false); load()
  }

  // ── Add forms (inline) ──────────────────────────────────────
  const [sessForm, setSessForm] = useState({
    title: '', session_date: '', start_time: '', end_time: '', campus: '', location: '', presenter: '', prep_notes: '', resource_url: '',
  })
  const addSession = async () => {
    if (!me || !sessForm.title.trim()) { setError('Session needs a topic.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase.from('cohort_sessions').insert({
      cohort_id: id, title: sessForm.title.trim(),
      session_date: sessForm.session_date || null,
      start_time: sessForm.start_time || null, end_time: sessForm.end_time || null,
      campus: sessForm.campus || null, location: sessForm.location.trim() || null,
      presenter: sessForm.presenter.trim() || null, prep_notes: sessForm.prep_notes.trim() || null,
      resource_url: sessForm.resource_url.trim() || null,
      sort_order: sessions.length, created_by: me.id,
    }).select()
    if (e || !data || data.length === 0) { fail('Could not add session', e); setBusy(false); return }
    setSessForm({ title: '', session_date: '', start_time: '', end_time: '', campus: '', location: '', presenter: '', prep_notes: '', resource_url: '' })
    setBusy(false); load()
  }

  const [taskForm, setTaskForm] = useState({ title: '', description: '', link_url: '', due_date: '', session_id: '', required: false })
  const addTask = async () => {
    if (!me || !taskForm.title.trim()) { setError('Task needs a title.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase.from('cohort_tasks').insert({
      cohort_id: id, title: taskForm.title.trim(),
      description: taskForm.description.trim() || null, link_url: taskForm.link_url.trim() || null,
      due_date: taskForm.due_date || null, session_id: taskForm.session_id || null,
      required: taskForm.required, sort_order: tasks.length, created_by: me.id,
    }).select()
    if (e || !data || data.length === 0) { fail('Could not add task', e); setBusy(false); return }
    setTaskForm({ title: '', description: '', link_url: '', due_date: '', session_id: '', required: false })
    setBusy(false); load()
  }

  const [slotForm, setSlotForm] = useState({ kind: 'one_on_one', host_id: '', title: '', slot_date: '', start_time: '', end_time: '', location: '', capacity: '1', notes: '' })
  const addSlot = async () => {
    if (!me) return
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase.from('cohort_slots').insert({
      cohort_id: id, kind: slotForm.kind, host_id: slotForm.host_id || me.id,
      title: slotForm.title.trim() || null, slot_date: slotForm.slot_date || null,
      start_time: slotForm.start_time || null, end_time: slotForm.end_time || null,
      location: slotForm.location.trim() || null, capacity: Math.max(1, Number(slotForm.capacity) || 1),
      notes: slotForm.notes.trim() || null, created_by: me.id,
    }).select()
    if (e || !data || data.length === 0) { fail('Could not add slot', e); setBusy(false); return }
    setSlotForm({ kind: 'one_on_one', host_id: '', title: '', slot_date: '', start_time: '', end_time: '', location: '', capacity: '1', notes: '' })
    setBusy(false); load()
  }

  // ── Inline edit: sessions ───────────────────────────────────
  const [editSessId, setEditSessId] = useState<string | null>(null)
  const [editSess, setEditSess] = useState({ title: '', session_date: '', start_time: '', end_time: '', campus: '', location: '', presenter: '', prep_notes: '', resource_url: '' })
  const startEditSession = (s: CohortSession) => {
    setEditSessId(s.id)
    setEditSess({
      title: s.title ?? '', session_date: s.session_date ?? '', start_time: s.start_time ?? '', end_time: s.end_time ?? '',
      campus: s.campus ?? '', location: s.location ?? '', presenter: s.presenter ?? '', prep_notes: s.prep_notes ?? '', resource_url: s.resource_url ?? '',
    })
  }
  const saveSession = async () => {
    if (!editSessId) return
    if (!editSess.title.trim()) { setError('Session needs a topic.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase.from('cohort_sessions').update({
      title: editSess.title.trim(), session_date: editSess.session_date || null,
      start_time: editSess.start_time || null, end_time: editSess.end_time || null,
      campus: editSess.campus || null, location: editSess.location.trim() || null,
      presenter: editSess.presenter.trim() || null, prep_notes: editSess.prep_notes.trim() || null,
      resource_url: editSess.resource_url.trim() || null,
    }).eq('id', editSessId).select()
    if (e || !data || data.length === 0) { fail('Could not save session', e); setBusy(false); return }
    setEditSessId(null); setBusy(false); load()
  }

  // ── Inline edit: tasks ──────────────────────────────────────
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState({ title: '', description: '', link_url: '', due_date: '', session_id: '', required: false })
  const startEditTask = (t: CohortTask) => {
    setEditTaskId(t.id)
    setEditTask({ title: t.title ?? '', description: t.description ?? '', link_url: t.link_url ?? '', due_date: t.due_date ?? '', session_id: t.session_id ?? '', required: t.required })
  }
  const saveTask = async () => {
    if (!editTaskId) return
    if (!editTask.title.trim()) { setError('Task needs a title.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { data, error: e } = await supabase.from('cohort_tasks').update({
      title: editTask.title.trim(), description: editTask.description.trim() || null,
      link_url: editTask.link_url.trim() || null, due_date: editTask.due_date || null,
      session_id: editTask.session_id || null, required: editTask.required,
    }).eq('id', editTaskId).select()
    if (e || !data || data.length === 0) { fail('Could not save task', e); setBusy(false); return }
    setEditTaskId(null); setBusy(false); load()
  }

  if (loading) return <div className="card h-64 animate-pulse bg-gray-100" />
  if (!cohort) return <div className="card p-6 text-sm text-gray-600">Cohort not found.</div>

  const roleMembers = members.filter((m) => m.member_role === 'member')
  const facilitators = members.filter((m) => m.member_role === 'facilitator')
  const signupsBySlot = (slotId: string) => signups.filter((s) => s.slot_id === slotId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display font-bold text-white text-xl truncate">{cohort.name}</h1>
              <p className="text-navy-200 text-sm mt-0.5">
                {cohort.school_year ?? 'Cohort'} · {members.length} member{members.length === 1 ? '' : 's'}
                {!cohort.is_active && ' · Archived'}
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {cohort.workspace_id && (
                <Link href={`/dashboard/workspaces/${cohort.workspace_id}`} className="text-sm text-white/90 hover:text-white underline">
                  Open cohort space →
                </Link>
              )}
              <button onClick={deleteCohort} disabled={busy} className="text-sm text-white/60 hover:text-white underline">
                Delete
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={clsx('tab', tab === t.key ? 'tab-active' : 'tab-inactive')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {notice && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{notice}</div>}

      {/* ── Roster ── */}
      {tab === 'roster' && (
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <label className="label">Add a member</label>
            <input className="input" placeholder="Search people by name or email…" value={picker} onChange={(e) => setPicker(e.target.value)} />
            {pickerMatches.length > 0 && (
              <ul className="border border-gray-200 rounded-lg divide-y">
                {pickerMatches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-800">{nameOf(p)} <span className="text-gray-400">· {p.title ?? p.email}</span></span>
                    <button className="btn-secondary text-xs" disabled={busy} onClick={() => addMember(p.id)}>Add</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {facilitators.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm">Facilitators</h3>
              <MemberList list={facilitators} profById={profById} busy={busy} onToggle={toggleFacilitator} onRemove={removeMember} />
            </section>
          )}
          <section className="space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Members</h3>
            {roleMembers.length === 0 ? (
              <p className="text-sm text-gray-400">No members yet — add new hires above.</p>
            ) : (
              <MemberList list={roleMembers} profById={profById} busy={busy} onToggle={toggleFacilitator} onRemove={removeMember} onWelcome={sendWelcome} />
            )}
          </section>
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === 'schedule' && (
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Add a session</h3>
            <input className="input" placeholder="Topic (e.g. Report & Comment Writing)" value={sessForm.title} onChange={(e) => setSessForm({ ...sessForm, title: e.target.value })} />
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="label">Date</label><input type="date" className="input" value={sessForm.session_date} onChange={(e) => setSessForm({ ...sessForm, session_date: e.target.value })} /></div>
              <div><label className="label">Start</label><input type="time" className="input" value={sessForm.start_time} onChange={(e) => setSessForm({ ...sessForm, start_time: e.target.value })} /></div>
              <div><label className="label">End</label><input type="time" className="input" value={sessForm.end_time} onChange={(e) => setSessForm({ ...sessForm, end_time: e.target.value })} /></div>
              <div>
                <label className="label">Campus</label>
                <select className="input" value={sessForm.campus} onChange={(e) => setSessForm({ ...sessForm, campus: e.target.value })}>
                  <option value="">Both</option><option value="86">86th St</option><option value="46">46th St</option>
                </select>
              </div>
              <div><label className="label">Location</label><input className="input" placeholder="Room 180" value={sessForm.location} onChange={(e) => setSessForm({ ...sessForm, location: e.target.value })} /></div>
              <div><label className="label">Presenter</label><input className="input" placeholder="Kim C" value={sessForm.presenter} onChange={(e) => setSessForm({ ...sessForm, presenter: e.target.value })} /></div>
            </div>
            <textarea className="input" rows={2} placeholder="Preparation needed (optional)" value={sessForm.prep_notes} onChange={(e) => setSessForm({ ...sessForm, prep_notes: e.target.value })} />
            <input className="input" placeholder="Resource link (optional)" value={sessForm.resource_url} onChange={(e) => setSessForm({ ...sessForm, resource_url: e.target.value })} />
            <div className="flex justify-end"><button className="btn-primary text-sm" disabled={busy} onClick={addSession}>Add session</button></div>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="card p-4">
                  {editSessId === s.id ? (
                    <div className="space-y-3">
                      <input className="input" value={editSess.title} onChange={(e) => setEditSess({ ...editSess, title: e.target.value })} />
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div><label className="label">Date</label><input type="date" className="input" value={editSess.session_date} onChange={(e) => setEditSess({ ...editSess, session_date: e.target.value })} /></div>
                        <div><label className="label">Start</label><input type="time" className="input" value={editSess.start_time} onChange={(e) => setEditSess({ ...editSess, start_time: e.target.value })} /></div>
                        <div><label className="label">End</label><input type="time" className="input" value={editSess.end_time} onChange={(e) => setEditSess({ ...editSess, end_time: e.target.value })} /></div>
                        <div>
                          <label className="label">Campus</label>
                          <select className="input" value={editSess.campus} onChange={(e) => setEditSess({ ...editSess, campus: e.target.value })}>
                            <option value="">Both</option><option value="86">86th St</option><option value="46">46th St</option>
                          </select>
                        </div>
                        <div><label className="label">Location</label><input className="input" value={editSess.location} onChange={(e) => setEditSess({ ...editSess, location: e.target.value })} /></div>
                        <div><label className="label">Presenter</label><input className="input" value={editSess.presenter} onChange={(e) => setEditSess({ ...editSess, presenter: e.target.value })} /></div>
                      </div>
                      <textarea className="input" rows={2} placeholder="Preparation needed" value={editSess.prep_notes} onChange={(e) => setEditSess({ ...editSess, prep_notes: e.target.value })} />
                      <input className="input" placeholder="Resource link" value={editSess.resource_url} onChange={(e) => setEditSess({ ...editSess, resource_url: e.target.value })} />
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary text-sm" onClick={() => setEditSessId(null)}>Cancel</button>
                        <button className="btn-primary text-sm" disabled={busy} onClick={saveSession}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatSessionDate(s.session_date)}{formatTimeRange(s.start_time, s.end_time) && ` · ${formatTimeRange(s.start_time, s.end_time)}`}
                          {' · '}{campusLabel(s.campus)}{s.location && ` · ${s.location}`}{s.presenter && ` · ${s.presenter}`}
                        </p>
                        {s.prep_notes && <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Prep:</span> {s.prep_notes}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button className="btn-ghost text-xs" disabled={busy} onClick={() => startEditSession(s)}>Edit</button>
                        <button className="btn-ghost text-xs text-red-600" disabled={busy} onClick={() => del('cohort_sessions', { id: s.id }, 'session')}>Delete</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Checklist ── */}
      {tab === 'checklist' && (
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Add a checklist task</h3>
            <input className="input" placeholder="Task (e.g. Log into your Folio account)" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            <textarea className="input" rows={2} placeholder="Details (optional)" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="label">Link (optional)</label><input className="input" placeholder="https://…" value={taskForm.link_url} onChange={(e) => setTaskForm({ ...taskForm, link_url: e.target.value })} /></div>
              <div><label className="label">Due (optional)</label><input type="date" className="input" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} /></div>
              <div>
                <label className="label">Tie to session (optional)</label>
                <select className="input" value={taskForm.session_id} onChange={(e) => setTaskForm({ ...taskForm, session_id: e.target.value })}>
                  <option value="">General task</option>
                  {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={taskForm.required} onChange={(e) => setTaskForm({ ...taskForm, required: e.target.checked })} /> Required
            </label>
            <div className="flex justify-end"><button className="btn-primary text-sm" disabled={busy} onClick={addTask}>Add task</button></div>
          </div>

          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const sess = t.session_id ? sessions.find((s) => s.id === t.session_id) : null
                return (
                  <li key={t.id} className="card p-4">
                    {editTaskId === t.id ? (
                      <div className="space-y-3">
                        <input className="input" value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} />
                        <textarea className="input" rows={2} placeholder="Details (optional)" value={editTask.description} onChange={(e) => setEditTask({ ...editTask, description: e.target.value })} />
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div><label className="label">Link</label><input className="input" placeholder="https://…" value={editTask.link_url} onChange={(e) => setEditTask({ ...editTask, link_url: e.target.value })} /></div>
                          <div><label className="label">Due</label><input type="date" className="input" value={editTask.due_date} onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })} /></div>
                          <div>
                            <label className="label">Session</label>
                            <select className="input" value={editTask.session_id} onChange={(e) => setEditTask({ ...editTask, session_id: e.target.value })}>
                              <option value="">General task</option>
                              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={editTask.required} onChange={(e) => setEditTask({ ...editTask, required: e.target.checked })} /> Required
                        </label>
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary text-sm" onClick={() => setEditTaskId(null)}>Cancel</button>
                          <button className="btn-primary text-sm" disabled={busy} onClick={saveTask}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {t.title} {t.required && <span className="badge badge-yellow text-[10px] ml-1">Required</span>}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {sess ? `Prep for: ${sess.title}` : 'General'}{t.due_date && ` · due ${formatSessionDate(t.due_date)}`}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button className="btn-ghost text-xs" disabled={busy} onClick={() => startEditTask(t)}>Edit</button>
                          <button className="btn-ghost text-xs text-red-600" disabled={busy} onClick={() => del('cohort_tasks', { id: t.id }, 'task')}>Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Slots ── */}
      {tab === 'slots' && (
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Offer bookable time</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Kind</label>
                <select className="input" value={slotForm.kind} onChange={(e) => setSlotForm({ ...slotForm, kind: e.target.value })}>
                  {SLOT_KINDS.map((k) => <option key={k} value={k}>{SLOT_KIND_LABELS[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Host</label>
                <select className="input" value={slotForm.host_id} onChange={(e) => setSlotForm({ ...slotForm, host_id: e.target.value })}>
                  <option value="">Me</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(profById(m.user_id))}</option>)}
                </select>
              </div>
              <div><label className="label">Date</label><input type="date" className="input" value={slotForm.slot_date} onChange={(e) => setSlotForm({ ...slotForm, slot_date: e.target.value })} /></div>
              <div><label className="label">Capacity</label><input type="number" min={1} className="input" value={slotForm.capacity} onChange={(e) => setSlotForm({ ...slotForm, capacity: e.target.value })} /></div>
              <div><label className="label">Start</label><input type="time" className="input" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} /></div>
              <div><label className="label">End</label><input type="time" className="input" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} /></div>
              <div><label className="label">Location</label><input className="input" value={slotForm.location} onChange={(e) => setSlotForm({ ...slotForm, location: e.target.value })} /></div>
              <div><label className="label">Label (optional)</label><input className="input" placeholder="Office Hours with Ravi" value={slotForm.title} onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })} /></div>
            </div>
            <div className="flex justify-end"><button className="btn-primary text-sm" disabled={busy} onClick={addSlot}>Add slot</button></div>
          </div>

          {slots.length === 0 ? (
            <p className="text-sm text-gray-400">No slots yet.</p>
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
                        const su = signupsBySlot(s.id)
                        const dp = dateParts(s.slot_date)
                        return (
                          <li key={s.id} className="card p-4 flex items-start justify-between gap-3">
                            <div className="flex gap-3 min-w-0">
                              <div className="shrink-0 w-12 rounded-lg bg-navy-50 border border-navy-100 text-navy-800 text-center py-1 self-start">
                                {dp ? (
                                  <>
                                    <div className="text-[9px] font-bold uppercase tracking-wide text-navy-600">{dp.month}</div>
                                    <div className="text-lg font-bold leading-none">{dp.day}</div>
                                    <div className="text-[9px] text-navy-500 mt-0.5">{dp.weekday}</div>
                                  </>
                                ) : (
                                  <div className="text-[9px] font-semibold py-2 text-navy-500">TBD</div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-navy-900">{formatTimeRange(s.start_time, s.end_time) || 'Time TBD'}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {s.title ? `${s.title} · ` : ''}host {nameOf(profById(s.host_id ?? ''))}{s.location && ` · ${s.location}`} · {su.length}/{s.capacity} booked
                                </p>
                                {su.length > 0 && (
                                  <p className="text-xs text-gray-600 mt-1">{su.map((x) => nameOf(profById(x.user_id))).join(', ')}</p>
                                )}
                              </div>
                            </div>
                            <button className="btn-ghost text-xs text-red-600 shrink-0" disabled={busy} onClick={() => del('cohort_slots', { id: s.id }, 'slot')}>Delete</button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Progress ── */}
      {tab === 'progress' && (
        <div className="space-y-2">
          {roleMembers.length === 0 ? (
            <p className="text-sm text-gray-400">No members to track yet.</p>
          ) : roleMembers.map((m) => {
            const doneIds = completions.filter((c) => c.user_id === m.user_id).map((c) => c.task_id)
            const prog = checklistProgress(tasks, doneIds)
            const booked = signups.filter((s) => s.user_id === m.user_id).length
            return (
              <div key={m.user_id} className="card p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{nameOf(profById(m.user_id))}</p>
                  <p className="text-xs text-gray-500">{booked} slot{booked === 1 ? '' : 's'} booked</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div className={clsx('h-2 rounded-full', prog.pct === 100 ? 'bg-grace-green' : 'bg-navy-700')} style={{ width: `${prog.pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-600 w-20 text-right">{prog.done}/{prog.total} · {prog.pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MemberList({
  list, profById, busy, onToggle, onRemove, onWelcome,
}: {
  list: CohortMember[]
  profById: (uid: string) => Profile | undefined
  busy: boolean
  onToggle: (m: CohortMember) => void
  onRemove: (m: CohortMember) => void
  onWelcome?: (m: CohortMember) => void
}) {
  return (
    <ul className="space-y-2">
      {list.map((m) => {
        const p = profById(m.user_id)
        return (
          <li key={m.user_id} className="card p-3 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-800 min-w-0 truncate">
              {p ? `${p.first_name} ${p.last_name}` : 'Unknown'} <span className="text-gray-400">· {p?.title ?? p?.email}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {onWelcome && (
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => onWelcome(m)}>Welcome</button>
              )}
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => onToggle(m)}>
                {m.member_role === 'facilitator' ? 'Make member' : 'Make facilitator'}
              </button>
              <button className="btn-ghost text-xs text-red-600" disabled={busy} onClick={() => onRemove(m)}>Remove</button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
