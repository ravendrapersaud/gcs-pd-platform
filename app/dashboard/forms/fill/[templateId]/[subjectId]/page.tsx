'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { FormTemplate, Profile, FormField } from '@/lib/types'
import clsx from 'clsx'

type CaptureIndicator = { id: string; title: string; order_index: number }
type CaptureDomain = { id: string; title: string; description: string | null; order_index: number; indicators: CaptureIndicator[] }
type CaptureFramework = { id: string; title: string; domains: CaptureDomain[] }

export default function FillFormPage() {
  const params = useParams()
  const templateId = Array.isArray(params.templateId) ? params.templateId[0] : (params.templateId as string)
  const subjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : (params.subjectId as string)
  const supabase = createClient()
  const router = useRouter()

  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [subject, setSubject] = useState<Profile | null>(null)
  const [framework, setFramework] = useState<CaptureFramework | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  // Framework evidence capture: per-domain narrative + per-indicator evidenced/note.
  const [narrative, setNarrative] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [indNote, setIndNote] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  // When editing an existing submission (?responseId=…), we UPDATE instead of
  // INSERT and prefill from the saved answers + evidence.
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const responseId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('responseId')
      : null
    setEditingResponseId(responseId)
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('form_templates').select('*').eq('id', templateId).single(),
      supabase.from('profiles').select('*').eq('id', subjectId).single(),
    ])
    setTemplate((t as FormTemplate) ?? null)
    setSubject((s as Profile) ?? null)

    const fwId = (t as FormTemplate | null)?.framework_id
    if (fwId) {
      const { data: fw } = await supabase
        .from('frameworks')
        .select('id, title, domains:framework_domains(id, title, description, order_index, indicators:framework_indicators(id, title, order_index))')
        .eq('id', fwId).single()
      if (fw) {
        const domains = ((fw as unknown as CaptureFramework).domains ?? [])
          .slice().sort((a, b) => a.order_index - b.order_index)
          .map((d) => ({ ...d, indicators: (d.indicators ?? []).slice().sort((a, b) => a.order_index - b.order_index) }))
        setFramework({ id: (fw as { id: string }).id, title: (fw as { title: string }).title, domains })
      }
    }

    // Editing: prefill answers, and the framework evidence tied to this response.
    if (responseId) {
      const [{ data: resp }, { data: ev }] = await Promise.all([
        supabase.from('form_responses').select('answers').eq('id', responseId).single(),
        supabase.from('competency_evidence').select('domain_id, indicator_id, note').eq('response_id', responseId),
      ])
      if (resp?.answers) setAnswers((resp.answers as Record<string, unknown>) ?? {})
      for (const r of (ev ?? []) as { domain_id: string; indicator_id: string | null; note: string | null }[]) {
        if (r.indicator_id) {
          setChecked((c) => ({ ...c, [r.indicator_id as string]: true }))
          if (r.note) setIndNote((n) => ({ ...n, [r.indicator_id as string]: r.note as string }))
        } else if (r.note) {
          setNarrative((n) => ({ ...n, [r.domain_id]: r.note as string }))
        }
      }
    }
    setLoading(false)
  }, [templateId, subjectId])
  useEffect(() => { load() }, [load])

  const setAnswer = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }))

  const submit = async () => {
    if (!template || !userId) return
    // Required-field check.
    for (const f of template.fields) {
      if (f.type === 'section' || !f.required) continue
      const v = answers[f.id]
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
      if (empty) { setError(`“${f.label}” is required.`); return }
    }
    setSaving(true); setError(null)

    // Create a new submission, or update the one being edited. `.select('id')`
    // detects a zero-row result (RLS blocked the write).
    let responseId: string
    if (editingResponseId) {
      const { data, error: err } = await supabase.from('form_responses')
        .update({ answers }).eq('id', editingResponseId).select('id')
      if (err) { setSaving(false); setError(err.message); return }
      if (!data || data.length === 0) { setSaving(false); setError('You don’t have permission to edit this response.'); return }
      responseId = editingResponseId
    } else {
      const { data, error: err } = await supabase.from('form_responses').insert({
        template_id: template.id, subject_id: subjectId, filled_by: userId,
        answers, status: 'submitted', submitted_at: new Date().toISOString(),
      }).select('id')
      if (err) { setSaving(false); setError(err.message); return }
      if (!data || data.length === 0) { setSaving(false); setError('You don’t have permission to fill this form for this person.'); return }
      responseId = data[0].id as string
    }

    // Framework evidence: a domain-level narrative row per filled domain, and an
    // indicator row per indicator marked evidenced. On edit, reconcile by
    // clearing this response's review-sourced rows first, then re-inserting.
    if (framework) {
      if (editingResponseId) {
        const { error: delErr } = await supabase.from('competency_evidence')
          .delete().eq('response_id', responseId).eq('source', 'review')
        if (delErr) { setSaving(false); setError(`Saved, but updating competency evidence failed: ${delErr.message}`); return }
      }
      const rows: Record<string, unknown>[] = []
      for (const d of framework.domains) {
        const narr = (narrative[d.id] ?? '').trim()
        if (narr) rows.push({ subject_id: subjectId, framework_id: framework.id, domain_id: d.id, indicator_id: null, source: 'review', response_id: responseId, note: narr, author_id: userId })
        for (const ind of d.indicators) {
          if (!checked[ind.id]) continue
          rows.push({ subject_id: subjectId, framework_id: framework.id, domain_id: d.id, indicator_id: ind.id, source: 'review', response_id: responseId, note: (indNote[ind.id] ?? '').trim() || null, author_id: userId })
        }
      }
      if (rows.length > 0) {
        const { error: evErr } = await supabase.from('competency_evidence').insert(rows)
        if (evErr) { setSaving(false); setError(`Review saved, but recording competency evidence failed: ${evErr.message}`); return }
      }
    }
    setSaving(false)
    router.push(`/dashboard/portfolio/${subjectId}`)
  }

  if (loading) return <div className="max-w-2xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>
  if (!template || !subject) return <div className="max-w-2xl mx-auto"><div className="card p-8 text-center text-gray-600">Form or person not found.</div></div>

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href={`/dashboard/portfolio/${subjectId}`} className="text-sm text-gray-500 hover:text-gray-700">← {subject.first_name}’s portfolio</Link>
        <h1 className="text-2xl font-display text-gray-900 mt-2">{editingResponseId ? `Edit · ${template.title}` : template.title}</h1>
        <p className="text-gray-500 text-sm">For {subject.first_name} {subject.last_name}{template.description ? ` · ${template.description}` : ''}</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card p-6 space-y-5">
        {template.fields.map((f) => <FieldInput key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswer(f.id, v)} />)}
        {template.fields.length === 0 && !framework && <p className="text-sm text-gray-400">This form has no fields.</p>}
      </div>

      {framework && (
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">{framework.title}</h2>
            <p className="text-sm text-gray-500">Mark the indicators {subject.first_name} has evidenced, and add a description per area. This is evidence, not a score.</p>
          </div>
          {framework.domains.map((d) => (
            <div key={d.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <h3 className="font-medium text-gray-900">{d.title}</h3>
                {d.description && <p className="text-xs text-gray-400">{d.description}</p>}
              </div>
              <div className="space-y-2">
                {d.indicators.map((ind) => (
                  <div key={ind.id} className="rounded-lg bg-gray-50 p-2.5">
                    <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                      <input type="checkbox" className="mt-0.5" checked={!!checked[ind.id]} onChange={(e) => setChecked((c) => ({ ...c, [ind.id]: e.target.checked }))} />
                      <span>{ind.title}</span>
                    </label>
                    {checked[ind.id] && (
                      <textarea rows={2} className="input text-sm resize-none mt-2" placeholder="Evidence / example (optional)…" value={indNote[ind.id] ?? ''} onChange={(e) => setIndNote((n) => ({ ...n, [ind.id]: e.target.value }))} />
                    )}
                  </div>
                ))}
                {d.indicators.length === 0 && <p className="text-xs text-gray-400">No indicators in this area.</p>}
              </div>
              <div>
                <label className="label text-xs">Description for {d.title} <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={2} className="input text-sm resize-y" placeholder="Narrative on this area…" value={narrative[d.id] ?? ''} onChange={(e) => setNarrative((n) => ({ ...n, [d.id]: e.target.value }))} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="flex gap-2">
          <Link href={`/dashboard/portfolio/${subjectId}`} className="btn-secondary flex-1 text-center">Cancel</Link>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : editingResponseId ? 'Save changes' : 'Submit form'}</button>
        </div>
      </div>
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'section') {
    return <h3 className="font-semibold text-gray-900 border-b border-gray-100 pb-1 pt-2">{field.label}</h3>
  }
  const label = (
    <label className="label">{field.label}{field.required && <span className="text-red-500"> *</span>}{field.help && <span className="block text-xs text-gray-400 font-normal">{field.help}</span>}</label>
  )
  const str = typeof value === 'string' ? value : ''
  switch (field.type) {
    case 'long_text':
      return <div>{label}<textarea rows={3} className="input resize-y" value={str} onChange={(e) => onChange(e.target.value)} /></div>
    case 'select':
      return <div>{label}<select className="input" value={str} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
    case 'checkboxes': {
      const arr = Array.isArray(value) ? (value as string[]) : []
      const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])
      return <div>{label}<div className="flex flex-wrap gap-2 mt-1">{(field.options ?? []).map((o) => (
        <button key={o} type="button" onClick={() => toggle(o)} className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors', arr.includes(o) ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-300 text-gray-600 hover:border-navy-400')}>{o}</button>
      ))}</div></div>
    }
    case 'date':
      return <div>{label}<input type="date" className="input" value={str} onChange={(e) => onChange(e.target.value)} /></div>
    case 'number':
      return <div>{label}<input type="number" className="input" value={str} onChange={(e) => onChange(e.target.value)} /></div>
    case 'link':
      return <div>{label}<input type="url" className="input" placeholder="https://…" value={str} onChange={(e) => onChange(e.target.value)} /></div>
    default:
      return <div>{label}<input className="input" value={str} onChange={(e) => onChange(e.target.value)} /></div>
  }
}
