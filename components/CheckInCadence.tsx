'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CheckInSchedule, CheckInNote, CheckInFrequency, Profile } from '@/lib/types'
import clsx from 'clsx'

const FREQ_LABEL: Record<CheckInFrequency, string> = {
  weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly',
  quarterly: 'Quarterly', twice_yearly: 'Twice a year', none: 'No set cadence',
}
const FREQS: CheckInFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'twice_yearly', 'none']

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function addInterval(dateStr: string, freq: CheckInFrequency): string | null {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  if (isNaN(d.getTime())) return null
  switch (freq) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'twice_yearly': d.setMonth(d.getMonth() + 6); break
    default: return null
  }
  return d.toISOString().slice(0, 10)
}

export default function CheckInCadence({ employeeId, employeeFirstName }: { employeeId: string; employeeFirstName: string }) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<CheckInSchedule | null>(null)
  const [notes, setNotes] = useState<CheckInNote[]>([])
  const [templates, setTemplates] = useState<{ id: string; title: string }[]>([])
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<{ frequency: CheckInFrequency; template_id: string; active: boolean }>({ frequency: 'monthly', template_id: '', active: true })
  const [busy, setBusy] = useState(false)

  const [noteText, setNoteText] = useState('')
  const [noteShared, setNoteShared] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [{ data: me }, { data: sched }, { data: noteRows }, { data: tmpls }, { data: resp }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('check_in_schedules').select('*').eq('employee_id', employeeId).maybeSingle(),
      supabase.from('check_in_notes').select('*, author:profiles!check_in_notes_author_id_fkey(first_name, last_name)').eq('employee_id', employeeId).order('created_at', { ascending: false }),
      supabase.from('form_templates').select('id, title').eq('is_active', true).eq('category', 'check_in').order('title'),
      supabase.from('form_responses').select('submitted_at, template:form_templates(category)').eq('subject_id', employeeId).eq('status', 'submitted').order('submitted_at', { ascending: false }),
    ])

    setRole((me?.role as string) ?? null)
    const s = (sched ?? null) as CheckInSchedule | null
    setSchedule(s)
    if (s) setForm({ frequency: s.frequency, template_id: s.template_id ?? '', active: s.active })
    setNotes((noteRows ?? []).map((n) => ({ ...n, author: (n as { author?: Profile }).author })) as CheckInNote[])
    setTemplates((tmpls ?? []) as { id: string; title: string }[])
    const lastResp = (resp ?? []).find((r) => (r.template as { category?: string } | null)?.category === 'check_in')
    setLastCheckIn((lastResp?.submitted_at as string) ?? null)
    setLoading(false)
  }, [employeeId])
  useEffect(() => { load() }, [load])

  const isSelf = userId === employeeId
  const canEditFreq = isSelf || role === 'admin'

  const saveSchedule = async () => {
    setBusy(true); setError(null)
    const row = { employee_id: employeeId, frequency: form.frequency, template_id: form.template_id || null, active: form.active, updated_at: new Date().toISOString() }
    const res = schedule
      ? await supabase.from('check_in_schedules').update(row).eq('id', schedule.id).select()
      : await supabase.from('check_in_schedules').insert(row).select()
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    if (!res.data || res.data.length === 0) { setError('Could not save (permission).'); return }
    setEditing(false); load()
  }

  const addNote = async () => {
    if (!noteText.trim() || !userId) return
    setBusy(true); setError(null)
    // A supervisor/admin note is always shared (they must be able to see it back).
    const shared = isSelf ? noteShared : true
    const { error: err } = await supabase.from('check_in_notes').insert({ employee_id: employeeId, author_id: userId, content: noteText.trim(), shared })
    setBusy(false)
    if (err) { setError(err.message); return }
    setNoteText(''); setNoteShared(true); load()
  }
  const deleteNote = async (id: string) => {
    const { error: err } = await supabase.from('check_in_notes').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading) return <div className="card h-28 animate-pulse bg-gray-100" />

  const anchor = lastCheckIn ? lastCheckIn.slice(0, 10) : schedule?.start_date ?? null
  const nextDue = schedule && schedule.active && anchor ? addInterval(anchor, schedule.frequency) : null
  const overdue = nextDue ? nextDue < new Date().toISOString().slice(0, 10) : false
  const preferredId = schedule?.template_id || templates[0]?.id || null

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Check-in cadence</h3>
          {schedule ? (
            <p className="text-sm text-gray-500 mt-0.5">
              {isSelf ? 'You check in' : `${employeeFirstName} checks in`} <span className="font-medium text-gray-700">{FREQ_LABEL[schedule.frequency].toLowerCase()}</span>
              {!schedule.active && ' (paused)'}
              {nextDue && (
                <> · <span className={clsx(overdue ? 'text-red-600 font-medium' : 'text-gray-500')}>{overdue ? 'due now' : `next around ${fmtDate(nextDue)}`}</span></>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">{isSelf ? "You haven't set a check-in cadence yet." : 'No cadence set yet.'}</p>
          )}
        </div>
        {canEditFreq && !editing && (
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs shrink-0">{schedule ? 'Edit' : 'Set cadence'}</button>
        )}
      </div>

      {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {editing && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">How often</label>
              <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as CheckInFrequency })}>
                {FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Preferred check-in form <span className="text-gray-400 font-normal">(optional)</span></label>
              <select className="input" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">No preference</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (pause anytime if circumstances change)
          </label>
          <div className="flex gap-2">
            <button onClick={saveSchedule} disabled={busy} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save cadence'}</button>
            <button onClick={() => { setEditing(false); setError(null) }} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      {preferredId && (
        <Link href={`/dashboard/forms/fill/${preferredId}/${employeeId}`} className="btn-secondary text-sm inline-block">
          {isSelf ? 'Do a check-in now →' : 'Start a check-in →'}
        </Link>
      )}

      {/* Note slots */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-800">Notes for your check-ins</p>
        <p className="text-xs text-gray-400 mb-2">Jot things to raise. {isSelf ? 'Mark a note private to keep it to yourself, or shared so your supervisor sees it.' : 'Notes you add here are shared with the employee.'}</p>

        <div className="flex flex-col gap-2 mb-3">
          <textarea rows={2} className="input text-sm resize-none" placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <div className="flex items-center justify-between gap-2">
            {isSelf ? (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={noteShared} onChange={(e) => setNoteShared(e.target.checked)} /> Share with my supervisor
              </label>
            ) : <span />}
            <button onClick={addNote} disabled={busy || !noteText.trim()} className="btn-secondary text-xs shrink-0">Add note</button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap min-w-0">{n.content}</p>
                  {(n.author_id === userId || role === 'admin') && (
                    <button onClick={() => deleteNote(n.id)} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-gray-400">{n.author ? `${n.author.first_name} ${n.author.last_name}` : '—'} · {fmtDate(n.created_at)}</span>
                  {!n.shared && <span className="badge badge-gray text-[10px]">private</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
