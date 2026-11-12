'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CheckInSchedule, CheckInNote, CheckInFollowUp, CheckInLink, CheckInFrequency, Profile } from '@/lib/types'
import { settingsMap } from '@/lib/appSettings'
import { trackForProfile, studentSupportDepartments, targetMatchesPerson } from '@/lib/tracks'
import { FREQ_LABEL, FREQ_ADVERB, FREQS, nextDueDate, isOverdue, todayISO } from '@/lib/checkins'
import clsx from 'clsx'

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

type Participant = { id: string; first_name: string; last_name: string }

// A friendly label for a linked doc, inferred from the URL (Google Docs etc.).
function docKind(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('docs.google.com/document')) return 'Doc'
  if (u.includes('docs.google.com/spreadsheets')) return 'Sheet'
  if (u.includes('docs.google.com/presentation')) return 'Slides'
  if (u.includes('docs.google.com/forms') || u.includes('forms.gle')) return 'Form'
  if (u.includes('drive.google.com')) return 'Drive'
  if (u.endsWith('.pdf')) return 'PDF'
  return 'Link'
}
const normalizeUrl = (raw: string) => {
  const t = raw.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export default function CheckInCadence({
  employeeId,
  employeeFirstName,
  pastCheckIns,
  pastCheckInCount = 0,
}: {
  employeeId: string
  employeeFirstName: string
  pastCheckIns?: ReactNode
  pastCheckInCount?: number
}) {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<CheckInSchedule | null>(null)
  const [notes, setNotes] = useState<CheckInNote[]>([])
  const [links, setLinks] = useState<CheckInLink[]>([])
  const [followUps, setFollowUps] = useState<CheckInFollowUp[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [templates, setTemplates] = useState<{ id: string; title: string }[]>([])
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<{ frequency: CheckInFrequency; template_id: string; active: boolean }>({ frequency: 'monthly', template_id: '', active: true })
  const [busy, setBusy] = useState(false)

  const [noteText, setNoteText] = useState('')
  const [noteShared, setNoteShared] = useState(true)

  const [fuText, setFuText] = useState('')
  const [fuOwner, setFuOwner] = useState('')
  const [fuDue, setFuDue] = useState('')

  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [{ data: me }, { data: emp }, { data: settingsRows }, { data: sched }, { data: noteRows }, { data: fuRows }, { data: linkRows }, { data: supRows }, { data: tmpls }, { data: resp }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('profiles').select('first_name, last_name, department, employee_type, teaches_classes, track, roles').eq('id', employeeId).single(),
      supabase.from('app_settings').select('key, value'),
      supabase.from('check_in_schedules').select('*').eq('employee_id', employeeId).maybeSingle(),
      supabase.from('check_in_notes').select('*, author:profiles!check_in_notes_author_id_fkey(first_name, last_name)').eq('employee_id', employeeId).order('created_at', { ascending: false }),
      supabase.from('check_in_follow_ups').select('*, author:profiles!check_in_follow_ups_author_id_fkey(first_name, last_name), owner:profiles!check_in_follow_ups_owner_id_fkey(first_name, last_name)').eq('employee_id', employeeId).order('created_at', { ascending: true }),
      supabase.from('check_in_links').select('*, author:profiles!check_in_links_author_id_fkey(first_name, last_name)').eq('employee_id', employeeId).order('created_at', { ascending: false }),
      supabase.from('supervisor_assignments').select('is_primary, supervisor:profiles!supervisor_assignments_supervisor_id_fkey(id, first_name, last_name)').eq('staff_id', employeeId),
      supabase.from('form_templates').select('id, title, target_tracks, target_roles').eq('is_active', true).eq('category', 'check_in').order('title'),
      supabase.from('form_responses').select('submitted_at, template:form_templates(category)').eq('subject_id', employeeId).eq('status', 'submitted').order('submitted_at', { ascending: false }),
    ])

    setRole((me?.role as string) ?? null)
    const s = (sched ?? null) as CheckInSchedule | null
    setSchedule(s)
    if (s) setForm({ frequency: s.frequency, template_id: s.template_id ?? '', active: s.active })
    setNotes((noteRows ?? []).map((n) => ({ ...n, author: (n as { author?: Profile }).author })) as CheckInNote[])
    setFollowUps((fuRows ?? []) as unknown as CheckInFollowUp[])
    setLinks((linkRows ?? []) as unknown as CheckInLink[])

    // Owner options = the employee + their supervisor(s), deduped.
    const empRow = (emp ?? {}) as { first_name?: string; last_name?: string }
    const sup = ((supRows ?? []) as unknown as { supervisor?: Participant | Participant[] }[])
      .map((r) => (Array.isArray(r.supervisor) ? r.supervisor[0] : r.supervisor))
      .filter(Boolean) as Participant[]
    const parts: Participant[] = [{ id: employeeId, first_name: empRow.first_name ?? employeeFirstName, last_name: empRow.last_name ?? '' }, ...sup]
    const seen = new Set<string>()
    setParticipants(parts.filter((p) => p && p.id && !seen.has(p.id) && seen.add(p.id)))
    // Default a new follow-up's owner to the viewer when they're a participant.
    setFuOwner((prev) => prev || (parts.some((p) => p.id === user.id) ? user.id : ''))

    const empTrack = trackForProfile(
      (emp ?? {}) as { track?: string | null; employee_type?: string | null; teaches_classes?: boolean | null; department?: string | null },
      studentSupportDepartments(settingsMap(settingsRows))
    )
    const empRoles = ((emp as { roles?: string[] } | null)?.roles) ?? []
    const matched = ((tmpls ?? []) as { id: string; title: string; target_tracks?: string[]; target_roles?: string[] }[])
      .filter((t) => targetMatchesPerson(t.target_tracks, t.target_roles, empTrack, empRoles))
    setTemplates(matched.map((t) => ({ id: t.id, title: t.title })))
    const lastResp = (resp ?? []).find((r) => (r.template as { category?: string } | null)?.category === 'check_in')
    setLastCheckIn((lastResp?.submitted_at as string) ?? null)
    setLoading(false)
  }, [employeeId, employeeFirstName])
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

  const addFollowUp = async () => {
    if (!fuText.trim() || !userId) return
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.from('check_in_follow_ups')
      .insert({ employee_id: employeeId, author_id: userId, owner_id: fuOwner || null, content: fuText.trim(), due_date: fuDue || null })
      .select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not add follow-up (permission).'); return }
    setFuText(''); setFuDue(''); load()
  }
  const toggleFollowUp = async (f: CheckInFollowUp) => {
    const done = f.status === 'open'
    const { data, error: err } = await supabase.from('check_in_follow_ups')
      .update({ status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null })
      .eq('id', f.id).select('id')
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not update follow-up (permission).'); return }
    load()
  }
  const deleteFollowUp = async (id: string) => {
    const { error: err } = await supabase.from('check_in_follow_ups').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  const addLink = async () => {
    const url = normalizeUrl(linkUrl)
    if (!url || !userId) return
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.from('check_in_links')
      .insert({ employee_id: employeeId, author_id: userId, title: linkTitle.trim() || url, url })
      .select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not add link (permission).'); return }
    setLinkTitle(''); setLinkUrl(''); load()
  }
  const deleteLink = async (id: string) => {
    const { error: err } = await supabase.from('check_in_links').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading) return <div className="card h-28 animate-pulse bg-gray-100" />

  const nextDue = schedule
    ? nextDueDate({ frequency: schedule.frequency, active: schedule.active, lastCheckIn, startDate: schedule.start_date })
    : null
  const overdue = isOverdue(nextDue)
  const preferredId = schedule?.template_id || templates[0]?.id || null

  const ownerLabel = (id: string | null) => {
    if (!id) return null
    if (id === userId) return 'you'
    const p = participants.find((x) => x.id === id)
    return p ? `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}` : 'someone'
  }

  const openFUs = followUps.filter((f) => f.status === 'open').sort((a, b) => {
    const ad = a.due_date ?? '9999-12-31', bd = b.due_date ?? '9999-12-31'
    if (ad !== bd) return ad < bd ? -1 : 1
    return a.created_at < b.created_at ? -1 : 1
  })
  const doneFUs = followUps.filter((f) => f.status === 'done').sort((a, b) => ((b.completed_at ?? '') < (a.completed_at ?? '') ? -1 : 1))
  const today = todayISO()

  const supervisors = participants.filter((p) => p.id !== employeeId)
  const withWhom = isSelf
    ? (supervisors.length === 1 ? ` with ${supervisors[0].first_name}` : supervisors.length > 1 ? ' with your supervisors' : '')
    : ''

  const startControl = templates.length > 1 ? (
    <select
      className="input text-sm py-1.5 w-auto"
      value=""
      onChange={(e) => { if (e.target.value) router.push(`/dashboard/forms/fill/${e.target.value}/${employeeId}`) }}
    >
      <option value="">New entry…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  ) : preferredId ? (
    <Link href={`/dashboard/forms/fill/${preferredId}/${employeeId}`} className="btn-primary text-sm shrink-0">New entry</Link>
  ) : null

  return (
    <div className="card p-5 space-y-4">
      {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ═══ Check-ins column — the ongoing 1:1: rhythm, docs, follow-ups, notes ═══ */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Check-ins</h4>
            {schedule ? (
              <p className="text-sm text-gray-500 mt-0.5">
                {isSelf ? 'You check in' : `${employeeFirstName} checks in`} <span className="font-medium text-gray-700">{FREQ_ADVERB[schedule.frequency]}</span>{withWhom}
                {!schedule.active && ' (paused)'}
                {nextDue && (
                  <> · <span className={clsx(overdue ? 'text-red-600 font-medium' : 'text-gray-500')}>{overdue ? 'due now' : `next around ${fmtDate(nextDue)}`}</span></>
                )}
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-0.5">{isSelf ? "You haven't set how often you check in yet." : 'No check-in rhythm set yet.'}</p>
            )}
          </div>
          {canEditFreq && !editing && (
            <button onClick={() => setEditing(true)} className="btn-ghost text-xs shrink-0">{schedule ? 'Edit' : 'Set rhythm'}</button>
          )}
        </div>

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
                <label className="label">Preferred form <span className="text-gray-400 font-normal">(optional)</span></label>
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
              <button onClick={saveSchedule} disabled={busy} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save rhythm'}</button>
              <button onClick={() => { setEditing(false); setError(null) }} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

      {/* Linked docs — the running Google doc(s) that anchor the 1:1 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-800">Linked docs</p>
        <p className="text-xs text-gray-400 mb-2">Pin the running doc(s) you keep between check-ins — a shared Google Doc, agenda, or folder. Visible to {isSelf ? 'you and your supervisor' : `${employeeFirstName} and their supervisors`}.</p>

        <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-wrap gap-2">
            <input className="input text-sm flex-1 min-w-[8rem]" placeholder="Label (e.g. Running 1:1 notes)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
            <input className="input text-sm flex-1 min-w-[10rem]" placeholder="Paste a Google Doc / Drive link…" value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl.trim()) addLink() }} />
            <button onClick={addLink} disabled={busy || !linkUrl.trim()} className="btn-secondary text-xs shrink-0">Add link</button>
          </div>
        </div>

        {links.length === 0 ? (
          <p className="text-sm text-gray-400">No linked docs yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5">
                <span className="badge badge-navy text-[10px] shrink-0">{docKind(l.url)}</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-navy-800 hover:underline min-w-0 truncate flex-1">{l.title}</a>
                {(l.author_id === userId || role === 'admin') && (
                  <button onClick={() => deleteLink(l.id)} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Follow-ups — the trackable action layer that carries between meetings */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">Follow-ups</p>
          {openFUs.length > 0 && <span className="badge badge-navy text-[10px]">{openFUs.length} open</span>}
        </div>
        <p className="text-xs text-gray-400 mb-2">Action items that carry between check-ins. Assign an owner and tick them off when done — open items surface here next time.</p>

        <div className="flex flex-col gap-2 mb-3">
          <input className="input text-sm" placeholder="Add a follow-up…" value={fuText}
            onChange={(e) => setFuText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && fuText.trim()) addFollowUp() }} />
          <div className="flex flex-wrap items-center gap-2">
            <select className="input text-sm w-auto" value={fuOwner} onChange={(e) => setFuOwner(e.target.value)} aria-label="Owner">
              <option value="">Unassigned</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.id === userId ? `${p.first_name} (you)` : `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`}</option>
              ))}
            </select>
            <input type="date" className="input text-sm w-auto" value={fuDue} onChange={(e) => setFuDue(e.target.value)} aria-label="Due date" />
            <button onClick={addFollowUp} disabled={busy || !fuText.trim()} className="btn-secondary text-xs shrink-0">Add follow-up</button>
          </div>
        </div>

        {followUps.length === 0 ? (
          <p className="text-sm text-gray-400">No follow-ups yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {openFUs.map((f) => {
              const od = f.due_date ? f.due_date < today : false
              return (
                <li key={f.id} className="flex items-start gap-2.5 rounded-lg border border-gray-100 p-2.5">
                  <button onClick={() => toggleFollowUp(f)} aria-label="Mark done"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-300 hover:border-navy-600 hover:bg-navy-50 transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.content}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      {f.owner_id && <span className="text-[11px] text-gray-500">{ownerLabel(f.owner_id)}</span>}
                      {f.due_date && (
                        <span className={clsx('text-[11px]', od ? 'text-red-600 font-medium' : 'text-gray-400')}>
                          {od ? 'overdue · ' : 'due '}{fmtDate(f.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  {(f.author_id === userId || role === 'admin') && (
                    <button onClick={() => deleteFollowUp(f.id)} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
                  )}
                </li>
              )
            })}
            {doneFUs.length > 0 && (
              <li className="pt-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Done</p>
                <ul className="space-y-1">
                  {doneFUs.map((f) => (
                    <li key={f.id} className="flex items-start gap-2.5 px-2.5 py-1.5">
                      <button onClick={() => toggleFollowUp(f)} aria-label="Reopen"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded bg-navy-600 text-white flex items-center justify-center text-[10px] leading-none hover:bg-navy-700 transition-colors">✓</button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-400 line-through whitespace-pre-wrap">{f.content}</p>
                        {f.completed_at && <span className="text-[11px] text-gray-300">done {fmtDate(f.completed_at)}</span>}
                      </div>
                      {(f.author_id === userId || role === 'admin') && (
                        <button onClick={() => deleteFollowUp(f.id)} className="text-xs text-gray-400 hover:text-red-600 hover:underline shrink-0">Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Note slots */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-800">Notes to raise</p>
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

      {/* ═══ Growth log column — the templated review / check-in forms, over time ═══ */}
      <div className="space-y-3 lg:border-l lg:border-gray-100 lg:pl-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Growth log{pastCheckInCount > 0 ? <span className="text-gray-400 font-normal"> ({pastCheckInCount})</span> : null}</h4>
            <p className="text-xs text-gray-400 mt-0.5">Self-reviews and reviews, kept as a record over time.</p>
          </div>
          {startControl}
        </div>
        {pastCheckIns}
      </div>
      </div>
    </div>
  )
}
