'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { FormTemplate, Profile, FormField } from '@/lib/types'
import clsx from 'clsx'

export default function FillFormPage() {
  const params = useParams()
  const templateId = Array.isArray(params.templateId) ? params.templateId[0] : (params.templateId as string)
  const subjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : (params.subjectId as string)
  const supabase = createClient()
  const router = useRouter()

  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [subject, setSubject] = useState<Profile | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('form_templates').select('*').eq('id', templateId).single(),
      supabase.from('profiles').select('*').eq('id', subjectId).single(),
    ])
    setTemplate((t as FormTemplate) ?? null)
    setSubject((s as Profile) ?? null)
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
    const { data, error: err } = await supabase.from('form_responses').insert({
      template_id: template.id, subject_id: subjectId, filled_by: userId,
      answers, status: 'submitted', submitted_at: new Date().toISOString(),
    }).select('id')
    setSaving(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('You don’t have permission to fill this form for this person.'); return }
    router.push(`/dashboard/portfolio/${subjectId}`)
  }

  if (loading) return <div className="max-w-2xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>
  if (!template || !subject) return <div className="max-w-2xl mx-auto"><div className="card p-8 text-center text-gray-600">Form or person not found.</div></div>

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href={`/dashboard/portfolio/${subjectId}`} className="text-sm text-gray-500 hover:text-gray-700">← {subject.first_name}’s portfolio</Link>
        <h1 className="text-2xl font-display text-gray-900 mt-2">{template.title}</h1>
        <p className="text-gray-500 text-sm">For {subject.first_name} {subject.last_name}{template.description ? ` · ${template.description}` : ''}</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card p-6 space-y-5">
        {template.fields.map((f) => <FieldInput key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswer(f.id, v)} />)}
        {template.fields.length === 0 && <p className="text-sm text-gray-400">This form has no fields.</p>}

        <div className="flex gap-2 pt-1">
          <Link href={`/dashboard/portfolio/${subjectId}`} className="btn-secondary flex-1 text-center">Cancel</Link>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">{saving ? 'Submitting…' : 'Submit form'}</button>
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
