'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FormTemplate, FormField, FormFieldType, FillBy, FormCategory } from '@/lib/types'
import { FIELD_TYPES, FIELD_TYPE_LABELS, FILL_BY_LABELS, hasOptions, newFieldId } from '@/lib/forms'
import { PD_ROLES, LEADERSHIP_ROLES } from '@/lib/roles'
import { TRACKS, TRACK_LABELS, targetSummary } from '@/lib/tracks'
import clsx from 'clsx'

type Draft = {
  id: string | null
  title: string
  description: string
  fill_by: FillBy
  visible_to_employee: boolean
  is_active: boolean
  category: FormCategory
  target_tracks: string[]
  target_roles: string[]
  fields: FormField[]
}

const blankDraft = (): Draft => ({
  id: null, title: '', description: '', fill_by: 'manager', visible_to_employee: false, is_active: true, category: 'form',
  target_tracks: [], target_roles: [], fields: [],
})

// Shared chip-toggle for the track / role targeting pickers.
function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
        on ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-300 text-gray-600 hover:border-navy-400'
      )}
    >
      {label}
    </button>
  )
}

export default function FormsSection() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)
    const { data, error: err } = await supabase.from('form_templates').select('*').order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setTemplates((data ?? []) as FormTemplate[])
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  const edit = (t: FormTemplate) => setDraft({
    id: t.id, title: t.title, description: t.description ?? '', fill_by: t.fill_by,
    visible_to_employee: t.visible_to_employee, is_active: t.is_active, category: t.category ?? 'form',
    target_tracks: t.target_tracks ?? [], target_roles: t.target_roles ?? [], fields: t.fields ?? [],
  })

  const toggleActive = async (t: FormTemplate) => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('form_templates').update({ is_active: !t.is_active }).eq('id', t.id).select('id')
    if (err) setError(err.message)
    await load(); setBusy(false)
  }

  const remove = async (t: FormTemplate) => {
    if (!window.confirm(`Delete the form “${t.title}”? Completed responses are removed too.`)) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('form_templates').delete().eq('id', t.id).select('id')
    if (err) setError(err.message)
    await load(); setBusy(false)
  }

  // ── draft editing ──
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const addField = () => patch({ fields: [...(draft?.fields ?? []), { id: newFieldId(), type: 'short_text', label: '', required: false }] })
  const patchField = (i: number, p: Partial<FormField>) => patch({ fields: (draft?.fields ?? []).map((f, idx) => idx === i ? { ...f, ...p } : f) })
  const removeField = (i: number) => patch({ fields: (draft?.fields ?? []).filter((_, idx) => idx !== i) })
  const moveField = (i: number, dir: -1 | 1) => {
    const f = draft?.fields ?? []; const j = i + dir
    if (j < 0 || j >= f.length) return
    const next = [...f]; [next[i], next[j]] = [next[j], next[i]]; patch({ fields: next })
  }

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim()) { setError('Give the form a title.'); return }
    if (draft.fields.some((f) => !f.label.trim())) { setError('Every field needs a label.'); return }
    setBusy(true); setError(null)
    const row = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      fields: draft.fields,
      fill_by: draft.fill_by,
      visible_to_employee: draft.visible_to_employee,
      is_active: draft.is_active,
      category: draft.category,
      target_tracks: draft.target_tracks,
      target_roles: draft.target_roles,
    }
    const res = draft.id
      ? await supabase.from('form_templates').update(row).eq('id', draft.id).select('id')
      : await supabase.from('form_templates').insert({ ...row, created_by: userId }).select('id')
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    if (!res.data || res.data.length === 0) { setError('Save had no effect — admins only.'); return }
    setDraft(null); await load()
  }

  // ── editor view ──
  if (draft) {
    return (
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-lg">{draft.id ? 'Edit form' : 'New form'}</h2>
          <button onClick={() => { setDraft(null); setError(null) }} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div><label className="label">Title</label><input className="input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. First-year associate coaching cycle" /></div>
        <div><label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label><textarea rows={2} className="input resize-none" value={draft.description} onChange={(e) => patch({ description: e.target.value })} /></div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Who fills it out</label>
            <select className="input" value={draft.fill_by} onChange={(e) => patch({ fill_by: e.target.value as FillBy })}>
              {(Object.keys(FILL_BY_LABELS) as FillBy[]).map((k) => <option key={k} value={k}>{FILL_BY_LABELS[k]}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={draft.visible_to_employee} onChange={(e) => patch({ visible_to_employee: e.target.checked })} />
              The employee can see completed copies
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
              Active (available to fill)
            </label>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer rounded-lg border border-gray-200 p-3">
          <input type="checkbox" className="mt-0.5" checked={draft.category === 'check_in'} onChange={(e) => patch({ category: e.target.checked ? 'check_in' : 'form' })} />
          <span>
            This is a <strong>check-in / 1:1</strong>
            <span className="text-gray-400"> — it appears in its own “Check-ins” section of the portfolio and prompts annually, rather than under general Forms.</span>
          </span>
        </label>

        {/* Targeting — who this form/check-in applies to */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Applies to</p>
            <p className="text-xs text-gray-400">
              Who sees this as a check-in/form to fill. Leave both blank for <strong>everyone</strong>.
              Current: <span className="text-gray-600">{targetSummary(draft.target_tracks, draft.target_roles, LEADERSHIP_ROLES)}</span>
            </p>
          </div>
          <div>
            <p className="label">Tracks</p>
            <div className="flex flex-wrap gap-1.5">
              {TRACKS.map((t) => {
                const on = draft.target_tracks.includes(t)
                return (
                  <Chip key={t} on={on} label={TRACK_LABELS[t]} onClick={() => patch({
                    target_tracks: on ? draft.target_tracks.filter((x) => x !== t) : [...draft.target_tracks, t],
                  })} />
                )
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="label mb-0">Roles</p>
              <button
                type="button"
                onClick={() => patch({ target_roles: LEADERSHIP_ROLES.every((r) => draft.target_roles.includes(r)) ? [] : [...LEADERSHIP_ROLES] })}
                className="text-xs text-navy-700 hover:underline"
              >
                {LEADERSHIP_ROLES.every((r) => draft.target_roles.includes(r)) ? 'Clear leaders' : 'Leaders only'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PD_ROLES.map((r) => {
                const on = draft.target_roles.includes(r)
                return (
                  <Chip key={r} on={on} label={r} onClick={() => patch({
                    target_roles: on ? draft.target_roles.filter((x) => x !== r) : [...draft.target_roles, r],
                  })} />
                )
              })}
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800">Fields</p>
          {draft.fields.length === 0 && <p className="text-sm text-gray-400">No fields yet — add one below.</p>}
          {draft.fields.map((f, i) => (
            <div key={f.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex flex-col shrink-0 pt-1">
                  <button onClick={() => moveField(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-navy-800 disabled:opacity-30 text-xs px-1">▲</button>
                  <button onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1} className="text-gray-400 hover:text-navy-800 disabled:opacity-30 text-xs px-1">▼</button>
                </div>
                <select className="input w-40 text-sm py-1.5 shrink-0" value={f.type} onChange={(e) => patchField(i, { type: e.target.value as FormFieldType })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
                </select>
                <input className="input flex-1 text-sm py-1.5" placeholder={f.type === 'section' ? 'Section heading' : 'Field label'} value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
                <button onClick={() => removeField(i)} className="text-xs font-medium text-red-600 hover:underline shrink-0 pt-2">Remove</button>
              </div>
              {hasOptions(f.type) && (
                <textarea rows={2} className="input text-sm resize-y ml-10" placeholder="One option per line" value={(f.options ?? []).join('\n')} onChange={(e) => patchField(i, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
              )}
              {f.type !== 'section' && (
                <label className="flex items-center gap-2 text-xs text-gray-600 ml-10 cursor-pointer">
                  <input type="checkbox" checked={f.required ?? false} onChange={(e) => patchField(i, { required: e.target.checked })} /> Required
                </label>
              )}
            </div>
          ))}
          <button onClick={addField} className="btn-secondary text-sm">+ Add field</button>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save form'}</button>
          <button onClick={() => { setDraft(null); setError(null) }} className="btn-ghost">Cancel</button>
        </div>
      </div>
    )
  }

  // ── list view ──
  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">Forms</h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-prose">Build forms that get filled out for employees and appear in their portfolio. Who fills each form and who can see the completed copy are set per form.</p>
        </div>
        <button onClick={() => setDraft(blankDraft())} className="btn-primary text-sm shrink-0">+ New form</button>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {!loaded ? (
        <div className="h-24 animate-pulse bg-gray-100 rounded-lg" />
      ) : templates.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No forms yet — create one.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {templates.map((t) => (
            <li key={t.id} className={clsx('px-3 py-2.5 flex items-center gap-2', !t.is_active && 'opacity-50 bg-gray-50')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 truncate">{t.title}</span>
                  {t.category === 'check_in' && <span className="badge badge-navy text-[10px] shrink-0">check-in</span>}
                  {!t.is_active && <span className="badge badge-gray text-[10px] shrink-0">inactive</span>}
                  {t.visible_to_employee && <span className="badge badge-green text-[10px] shrink-0">employee-visible</span>}
                  {((t.target_tracks ?? []).length > 0 || (t.target_roles ?? []).length > 0) && (
                    <span className="badge badge-yellow text-[10px] shrink-0">{targetSummary(t.target_tracks, t.target_roles, LEADERSHIP_ROLES)}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{(t.fields ?? []).filter((f) => f.type !== 'section').length} fields · filled by {FILL_BY_LABELS[t.fill_by].toLowerCase()}</p>
              </div>
              <button onClick={() => edit(t)} disabled={busy} className="text-xs font-medium text-navy-800 hover:underline shrink-0">Edit</button>
              <button onClick={() => toggleActive(t)} disabled={busy} className="text-xs font-medium text-navy-800 hover:underline shrink-0">{t.is_active ? 'Deactivate' : 'Activate'}</button>
              <button onClick={() => remove(t)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline shrink-0">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
