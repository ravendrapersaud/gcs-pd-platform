'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ProjectFollowUp } from '@/lib/types'
import { FREQ_LABEL, FREQ_ADVERB, addInterval, todayISO, isOverdue } from '@/lib/checkins'
import clsx from 'clsx'

// Project syncs & follow-ups: a sync cadence + owned, carry-over action items for
// a collaborative project — the check-in pattern, project-scoped. RLS lets anyone
// who can see the project read, and owner/collaborators/admin write.

const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
type SyncFreq = 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
const SYNC_FREQS: SyncFreq[] = ['weekly', 'biweekly', 'monthly', 'quarterly']

export default function ProjectSyncs({
  projectId, participants, canEdit, syncFrequency, nextSync,
}: {
  projectId: string
  participants: Profile[]
  canEdit: boolean
  syncFrequency: SyncFreq | null
  nextSync: string | null
}) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [followUps, setFollowUps] = useState<ProjectFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [freq, setFreq] = useState<SyncFreq | null>(syncFrequency)
  const [next, setNext] = useState<string | null>(nextSync)
  const [editingCadence, setEditingCadence] = useState(false)
  const [cadForm, setCadForm] = useState<{ frequency: SyncFreq; next: string }>({ frequency: syncFrequency ?? 'weekly', next: nextSync ?? '' })

  const [fuText, setFuText] = useState('')
  const [fuOwner, setFuOwner] = useState('')
  const [fuDue, setFuDue] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setFuOwner((prev) => prev || (participants.some((p) => p.id === user.id) ? user.id : ''))
    const { data: rows, error: err } = await supabase.from('project_follow_ups')
      .select('*').eq('project_id', projectId).order('created_at', { ascending: true })
    if (err) setError(err.message)
    setFollowUps((rows ?? []) as ProjectFollowUp[])
    setLoading(false)
  }, [projectId])
  useEffect(() => { load() }, [load])

  const saveCadence = async () => {
    setBusy(true); setError(null)
    const payload = { sync_frequency: cadForm.frequency, next_sync: cadForm.next || null, updated_at: new Date().toISOString() }
    const { data, error: err } = await supabase.from('projects').update(payload).eq('id', projectId).select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not save (permission).'); return }
    setFreq(cadForm.frequency); setNext(cadForm.next || null); setEditingCadence(false)
  }
  const logSync = async () => {
    if (!freq) return
    const advanced = addInterval(next ?? todayISO(), freq)
    const { data, error: err } = await supabase.from('projects').update({ next_sync: advanced, updated_at: new Date().toISOString() }).eq('id', projectId).select('id')
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not update (permission).'); return }
    setNext(advanced)
  }

  const addFollowUp = async () => {
    if (!fuText.trim() || !userId) return
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.from('project_follow_ups')
      .insert({ project_id: projectId, created_by: userId, owner_id: fuOwner || null, content: fuText.trim(), due_date: fuDue || null })
      .select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not add follow-up (permission).'); return }
    setFuText(''); setFuDue(''); load()
  }
  const toggleFollowUp = async (f: ProjectFollowUp) => {
    const done = f.status === 'open'
    const { error: err } = await supabase.from('project_follow_ups')
      .update({ status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null }).eq('id', f.id)
    if (err) { setError(err.message); return }
    load()
  }
  const deleteFollowUp = async (id: string) => {
    const { error: err } = await supabase.from('project_follow_ups').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading) return <div className="card h-28 animate-pulse bg-gray-100" />

  const today = todayISO()
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
  const nextOverdue = isOverdue(next)

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Syncs &amp; follow-ups</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {freq ? (
              <>Team syncs <span className="font-medium text-gray-700">{FREQ_ADVERB[freq]}</span>
                {next && <> · <span className={clsx(nextOverdue ? 'text-red-600 font-medium' : 'text-gray-500')}>{nextOverdue ? 'sync due' : `next ${fmtDate(next)}`}</span></>}
              </>
            ) : 'No sync rhythm set.'}
          </p>
        </div>
        {canEdit && !editingCadence && (
          <div className="flex items-center gap-2 shrink-0">
            {freq && <button onClick={logSync} className="btn-secondary text-xs">Logged a sync</button>}
            <button onClick={() => { setCadForm({ frequency: freq ?? 'weekly', next: next ?? '' }); setEditingCadence(true) }} className="btn-ghost text-xs">{freq ? 'Edit' : 'Set rhythm'}</button>
          </div>
        )}
      </div>

      {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {editingCadence && (
        <div className="rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">How often</label>
            <select className="input" value={cadForm.frequency} onChange={(e) => setCadForm({ ...cadForm, frequency: e.target.value as SyncFreq })}>
              {SYNC_FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Next sync <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="date" className="input" value={cadForm.next} onChange={(e) => setCadForm({ ...cadForm, next: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={saveCadence} disabled={busy} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save rhythm'}</button>
            <button onClick={() => { setEditingCadence(false); setError(null) }} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Follow-ups */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">Follow-ups</p>
          {openFUs.length > 0 && <span className="badge badge-navy text-[10px]">{openFUs.length} open</span>}
        </div>
        <p className="text-xs text-gray-400 mb-2">Action items from your syncs — assigned to the team and carried until done.</p>

        {canEdit && (
          <div className="flex flex-col gap-2 mb-3">
            <input className="input text-sm" placeholder="Add a follow-up…" value={fuText}
              onChange={(e) => setFuText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && fuText.trim()) addFollowUp() }} />
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
        )}

        {followUps.length === 0 ? (
          <p className="text-sm text-gray-400">No follow-ups yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {openFUs.map((f) => {
              const od = f.due_date ? f.due_date < today : false
              return (
                <li key={f.id} className="flex items-start gap-2.5 rounded-lg border border-gray-100 p-2.5">
                  <button onClick={() => canEdit && toggleFollowUp(f)} aria-label="Mark done" disabled={!canEdit}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-300 enabled:hover:border-navy-600 enabled:hover:bg-navy-50 transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.content}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      {f.owner_id && <span className="text-[11px] text-gray-500">{ownerLabel(f.owner_id)}</span>}
                      {f.due_date && (
                        <span className={clsx('text-[11px]', od ? 'text-red-600 font-medium' : 'text-gray-400')}>{od ? 'overdue · ' : 'due '}{fmtDate(f.due_date)}</span>
                      )}
                    </div>
                  </div>
                  {canEdit && <button onClick={() => deleteFollowUp(f.id)} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>}
                </li>
              )
            })}
            {doneFUs.length > 0 && (
              <li className="pt-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Done</p>
                <ul className="space-y-1">
                  {doneFUs.map((f) => (
                    <li key={f.id} className="flex items-start gap-2.5 px-2.5 py-1.5">
                      <button onClick={() => canEdit && toggleFollowUp(f)} aria-label="Reopen" disabled={!canEdit}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded bg-navy-600 text-white flex items-center justify-center text-[10px] leading-none enabled:hover:bg-navy-700 transition-colors">✓</button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-400 line-through whitespace-pre-wrap">{f.content}</p>
                        {f.completed_at && <span className="text-[11px] text-gray-300">done {fmtDate(f.completed_at)}</span>}
                      </div>
                      {canEdit && <button onClick={() => deleteFollowUp(f.id)} className="text-xs text-gray-400 hover:text-red-600 hover:underline shrink-0">Remove</button>}
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
