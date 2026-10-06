'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PersonPicker from '@/components/PersonPicker'
import type { Profile, Framework, FrameworkDomain } from '@/lib/types'
import { DIVISION_OPTIONS } from '@/lib/taxonomy'
import clsx from 'clsx'
import {
  MODES, WHO, MODE_TO_OBS_TYPE, TWG_FRAMEWORK_TITLE,
  ADDONS, ADDON_MAP, ADDON_PREFIX, CUSTOM_CATEGORY_ID, ADDON_COLOR,
  emptyTwgData, normalizeCapture, formatElapsed, segmentsFromSpans, excerptsForNote, categoryColor,
  type ObsMode, type TwgData, type TwgNote, type CategoryAnalysis, type CaptureCategory,
} from '@/lib/twg'

const STEPS: [string, string][] = [
  ['setup', 'Set up'], ['notes', 'Live notes'], ['analysis', 'Analysis'], ['share', 'Share'],
]
const WHO_ORDER = ['T', 'S', 'E', '']

function newId(p: string) {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function getSelectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(container)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const end = start + range.toString().length
  return end > start ? { start, end } : null
}

export default function ObservationCapturePage() {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(true)
  const [userId, setUserId] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [frameworkId, setFrameworkId] = useState<string>('')

  const [step, setStep] = useState<string>('setup')
  const [obsId, setObsId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [notice, setNotice] = useState<string | null>(null)
  const [person, setPerson] = useState<Profile | null>(null)
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [twg, setTwg] = useState<TwgData>(() => emptyTwgData('full'))

  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)
  const [, forceTick] = useState(0)
  const [draft, setDraft] = useState('')
  const [nextWho, setNextWho] = useState('T')
  const [nextTags, setNextTags] = useState<string[]>([])
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [annot, setAnnot] = useState<{ noteId: string; start: number; end: number } | null>(null)
  const [annotTags, setAnnotTags] = useState<string[]>([])

  const [shareNotes, setShareNotes] = useState(false)
  const [shareFlags, setShareFlags] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showFramework, setShowFramework] = useState(false)
  const [openRefs, setOpenRefs] = useState<Set<string>>(new Set())
  const [openEvidence, setOpenEvidence] = useState<Set<string>>(new Set())
  const [shareLookfors, setShareLookfors] = useState(true)

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  // Pick a framework and default its categories to all of its domains.
  const selectFramework = useCallback((fws: Framework[], id: string) => {
    const fw = fws.find((f) => f.id === id)
    const cats: CaptureCategory[] = (fw?.domains ?? []).map((d) => ({ id: d.id, title: d.title }))
    setFrameworkId(id)
    setTwg((t) => ({ ...t, frameworkTitle: fw?.title, categories: cats }))
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }
      setUserId(user.id)
      const [{ data: profile }, { data: profs }, { data: fws }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('profiles').select('*').order('first_name'),
        supabase.from('frameworks').select('*, domains:framework_domains(*, indicators:framework_indicators(*))').order('title'),
      ])
      setAllowed(profile?.role === 'supervisor' || profile?.role === 'admin')
      setProfiles((profs ?? []) as Profile[])
      const fwList = (fws ?? []) as unknown as Framework[]
      setFrameworks(fwList)

      const editId = new URLSearchParams(window.location.search).get('id')
      if (editId) {
        const { data: obs } = await supabase.from('observations').select('*').eq('id', editId).maybeSingle()
        if (obs) {
          setObsId(obs.id as string)
          setStatus((obs.status as 'draft' | 'published') ?? 'draft')
          setObservedAt(new Date(obs.observed_at as string).toISOString().slice(0, 16))
          setFrameworkId((obs.framework_id as string) ?? '')
          const found = (profs ?? []).find((p) => p.id === obs.observed_id) as Profile | undefined
          if (found) setPerson(found)
          const fwForObs = fwList.find((f) => f.id === (obs.framework_id as string))
          const doms = (fwForObs?.domains ?? []).map((d) => ({ id: d.id, title: d.title }))
          if (obs.twg_data) setTwg(normalizeCapture(obs.twg_data, doms))
        }
      } else {
        // New observation: default to Teaching with Grace, else the first framework.
        const twgFw = fwList.find((f) => f.title === TWG_FRAMEWORK_TITLE) ?? fwList[0]
        if (twgFw) selectFramework(fwList, twgFw.id)
      }
      setReady(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (startedAt == null || stoppedAt != null) return
    const h = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(h)
  }, [startedAt, stoppedAt])

  const elapsed = startedAt == null ? null : (stoppedAt ?? Date.now()) - startedAt

  // ── Derived framework data ──────────────────────────────────────
  const selectedFw = useMemo(() => frameworks.find((f) => f.id === frameworkId), [frameworks, frameworkId])
  const domains: FrameworkDomain[] = useMemo(() => selectedFw?.domains ?? [], [selectedFw])
  const domainIndex = useMemo(() => {
    const m = new Map<string, number>()
    domains.forEach((d, i) => m.set(d.id, i))
    return m
  }, [domains])
  const isAddon = (id: string) => id.startsWith(ADDON_PREFIX)
  const catColor = (id: string) =>
    isAddon(id) || id === CUSTOM_CATEGORY_ID ? ADDON_COLOR : categoryColor(domainIndex.get(id) ?? 0)
  const catTitle = (id: string) =>
    domains.find((d) => d.id === id)?.title ?? twg.categories.find((c) => c.id === id)?.title ?? 'Category'
  const catDescription = (id: string): string =>
    isAddon(id) ? (ADDON_MAP[id.slice(ADDON_PREFIX.length)]?.hint ?? '') : (domains.find((d) => d.id === id)?.description ?? '')

  const patch = (p: Partial<TwgData>) => setTwg((t) => ({ ...t, ...p }))

  const toggleCategory = (d: FrameworkDomain) =>
    setTwg((t) => ({
      ...t,
      categories: t.categories.some((c) => c.id === d.id)
        ? t.categories.filter((c) => c.id !== d.id)
        : [...t.categories, { id: d.id, title: d.title }],
    }))

  const tagOptions = twg.categories

  const toggleNextTag = (k: string) =>
    setNextTags((tags) => (tags.includes(k) ? tags.filter((x) => x !== k) : [...tags, k]))

  const addNote = () => {
    const text = draft.trim()
    if (!text) return
    let start = startedAt
    if (start == null) { start = Date.now(); setStartedAt(start) }
    const note: TwgNote = { id: newId('n'), t: Date.now() - start, who: nextWho, text, tags: [...nextTags] }
    setTwg((t) => ({ ...t, notes: [...t.notes, note] }))
    setDraft('')
    composerRef.current?.focus()
  }
  const deleteNote = (id: string) => setTwg((t) => ({ ...t, notes: t.notes.filter((n) => n.id !== id) }))

  const beginAnnotate = (noteId: string, container: HTMLElement) => {
    const off = getSelectionOffsets(container)
    if (!off) { setAnnot(null); return }
    setAnnot({ noteId, ...off })
    setAnnotTags([])
  }
  const applySpan = () => {
    if (!annot || annotTags.length === 0) { setAnnot(null); return }
    setTwg((t) => ({
      ...t,
      notes: t.notes.map((n) =>
        n.id === annot.noteId
          ? { ...n, spans: [...(n.spans ?? []), { start: annot.start, end: annot.end, tags: [...annotTags] }] }
          : n
      ),
    }))
    setAnnot(null)
    window.getSelection()?.removeAllRanges()
  }
  const removeSpanAt = (noteId: string, a: number, b: number) =>
    setTwg((t) => ({
      ...t,
      notes: t.notes.map((n) =>
        n.id === noteId ? { ...n, spans: (n.spans ?? []).filter((s) => !(s.start < b && s.end > a)) } : n
      ),
    }))

  const setAnalysis = (id: string, p: Partial<CategoryAnalysis>) =>
    setTwg((t) => {
      const prev = t.analysis[id] ?? { strengths: '', growth: '', flag: false }
      return { ...t, analysis: { ...t.analysis, [id]: { ...prev, ...p } } }
    })

  const indicatorsFor = (id: string): { id: string; title: string }[] => {
    if (isAddon(id)) return (ADDON_MAP[id.slice(ADDON_PREFIX.length)]?.lookfors ?? []).map((l, i) => ({ id: `${id}:${i}`, title: l }))
    if (id === CUSTOM_CATEGORY_ID) return twg.customLookfors.split('\n').map((s) => s.trim()).filter(Boolean).map((l, i) => ({ id: `custom:${i}`, title: l }))
    return (domains.find((d) => d.id === id)?.indicators ?? []).map((ind) => ({ id: ind.id, title: ind.title }))
  }

  const toggleAddon = (key: string) => {
    const id = ADDON_PREFIX + key
    setTwg((t) => ({
      ...t,
      categories: t.categories.some((c) => c.id === id)
        ? t.categories.filter((c) => c.id !== id)
        : [...t.categories, { id, title: ADDON_MAP[key]?.name ?? key }],
    }))
  }

  const setCustomLookfors = (val: string) =>
    setTwg((t) => {
      const has = t.categories.some((c) => c.id === CUSTOM_CATEGORY_ID)
      const nonEmpty = val.trim().length > 0
      let categories = t.categories
      if (nonEmpty && !has) categories = [...categories, { id: CUSTOM_CATEGORY_ID, title: 'Your look-fors' }]
      if (!nonEmpty && has) categories = categories.filter((c) => c.id !== CUSTOM_CATEGORY_ID)
      return { ...t, customLookfors: val, categories }
    })

  const toggleCheck = (domainId: string, lookfor: string) =>
    setTwg((t) => {
      const cur = t.checks?.[domainId] ?? []
      const next = cur.includes(lookfor) ? cur.filter((x) => x !== lookfor) : [...cur, lookfor]
      return { ...t, checks: { ...(t.checks ?? {}), [domainId]: next } }
    })

  // ── Teacher-facing summary ──────────────────────────────────────
  const summaryMarkdown = useMemo(() => {
    const lines: string[] = []
    const who = person ? `${person.first_name} ${person.last_name}` : 'Teacher'
    lines.push(`# ${twg.frameworkTitle ?? 'Observation'} — Observation`)
    lines.push('')
    lines.push(`**Teacher:** ${who}`)
    if (twg.course) lines.push(`**Course:** ${twg.course}`)
    if (twg.division) lines.push(`**Division:** ${twg.division}`)
    lines.push(`**Date:** ${new Date(observedAt).toLocaleString()}`)
    lines.push(`**Visit:** ${MODES[twg.mode].label}`)
    lines.push('')
    for (const c of twg.categories) {
      const a = twg.analysis[c.id]
      const look = shareLookfors ? (twg.checks?.[c.id] ?? []) : []
      const hasFlag = shareFlags && a?.flag
      if (!a?.strengths && !a?.growth && !hasFlag && !look.length) continue
      lines.push(`## ${c.title}`)
      if (look.length) { lines.push(`**Look-fors noticed:**`); for (const l of look) lines.push(`- ${l}`) }
      if (a?.strengths) lines.push(`**Strengths:** ${a.strengths}`)
      if (a?.growth) lines.push(`**Growth and support:** ${a.growth}`)
      if (hasFlag) lines.push(`⚑ _Follow-up support flagged._`)
      lines.push('')
    }
    if (twg.wrap.overall) { lines.push(`## Overall`); lines.push(twg.wrap.overall); lines.push('') }
    if (twg.wrap.next) { lines.push(`## Next steps`); lines.push(twg.wrap.next); lines.push('') }
    if (twg.wrap.questions) { lines.push(`## Questions to discuss`); lines.push(twg.wrap.questions); lines.push('') }
    if (shareNotes && twg.notes.length) {
      lines.push(`## Timestamped notes`)
      for (const n of twg.notes) {
        const tags = n.tags.map((k) => catTitle(k)).join(', ')
        lines.push(`- \`${formatElapsed(n.t)}\` ${WHO[n.who] ? `(${WHO[n.who]}) ` : ''}${n.text}${tags ? ` — _${tags}_` : ''}`)
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }, [twg, person, observedAt, shareNotes, shareFlags, shareLookfors, domains])

  const hasSummary = twg.categories.some((c) => {
    const a = twg.analysis[c.id]
    return (a && (a.strengths || a.growth)) || (twg.checks?.[c.id]?.length ?? 0) > 0
  }) || twg.wrap.overall

  // ── Persistence ─────────────────────────────────────────────────
  const saveObservation = useCallback(async (nextStatus: 'draft' | 'published'): Promise<string | null> => {
    if (!person) { setError('Choose the teacher being observed first.'); setStep('setup'); return null }
    setSaving(true); setError(null); setNotice(null)
    const payload: TwgData = { ...twg, durationMs: elapsed }
    const row = {
      observer_id: userId,
      observed_id: person.id,
      framework_id: frameworkId || null,
      obs_type: MODE_TO_OBS_TYPE[twg.mode],
      observed_at: new Date(observedAt).toISOString(),
      notes: twg.wrap.overall || null,
      status: nextStatus,
      twg_data: payload,
    }
    try {
      let id = obsId
      if (obsId) {
        const { error: e } = await supabase.from('observations').update(row).eq('id', obsId)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.from('observations').insert(row).select('id').single()
        if (e) throw e
        id = (data as { id: string }).id
        setObsId(id)
      }
      setStatus(nextStatus)
      setSavedAt(new Date().toLocaleTimeString())
      return id
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save this observation.')
      return null
    } finally {
      setSaving(false)
    }
  }, [person, twg, elapsed, userId, frameworkId, observedAt, obsId])

  const publish = useCallback(async () => {
    const id = await saveObservation('published')
    if (!id) return
    try {
      const res = await fetch('/api/observations/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const body = await res.json().catch(() => ({}))
      if (body.email === 'sent') setNotice('Published — the teacher has been emailed.')
      else if (body.email === 'skipped') setNotice('Published. Email sending is off (no RESEND_API_KEY), so the teacher was not emailed.')
      else setNotice(`Published, but the email didn’t send${body.error ? `: ${body.error}` : ''}. The teacher can still see it in the app.`)
    } catch {
      setNotice('Published, but the notification request failed. The teacher can still see it in the app.')
    }
  }, [saveObservation])

  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summaryMarkdown); setSavedAt('copied'); setTimeout(() => setSavedAt(null), 1500) }
    catch { setError('Copy was blocked — select the summary text and copy it manually.') }
  }
  const fileBase = () => `obs-${(person ? person.last_name : 'observation').toLowerCase()}-${observedAt.slice(0, 10)}`
  const triggerDownload = (data: string, type: string, ext: string) => {
    const blob = new Blob([data], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${fileBase()}.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }
  const downloadSummary = () => triggerDownload(summaryMarkdown, 'text/markdown;charset=utf-8;', 'md')

  const buildSummaryHtml = () => {
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const who = person ? `${person.first_name} ${person.last_name}` : 'Teacher'
    const meta: [string, string][] = [
      ['Teacher', who],
      ...(twg.course ? [['Course', twg.course] as [string, string]] : []),
      ...(twg.division ? [['Division', twg.division] as [string, string]] : []),
      ['Date', new Date(observedAt).toLocaleString()],
      ['Visit', MODES[twg.mode].label],
    ]
    const sections: string[] = []
    for (const c of twg.categories) {
      const a = twg.analysis[c.id]
      const look = shareLookfors ? (twg.checks?.[c.id] ?? []) : []
      const hasFlag = shareFlags && a?.flag
      if (!a?.strengths && !a?.growth && !hasFlag && !look.length) continue
      sections.push(
        `<section style="margin:20px 0"><h2 style="font-size:18px;margin:0 0 6px;display:flex;align-items:center;gap:8px">` +
        `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${catColor(c.id)}"></span>${esc(c.title)}</h2>` +
        (look.length ? `<p style="margin:4px 0;color:#6b7280;font-size:12px;letter-spacing:.05em;text-transform:uppercase">Look-fors noticed</p><ul style="margin:4px 0 8px;color:#374151">${look.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '') +
        (a?.strengths ? `<p style="margin:6px 0"><strong>Strengths:</strong> ${esc(a.strengths)}</p>` : '') +
        (a?.growth ? `<p style="margin:6px 0"><strong>Growth and support:</strong> ${esc(a.growth)}</p>` : '') +
        (hasFlag ? `<p style="margin:6px 0;color:#b45309">⚑ Follow-up support flagged.</p>` : '') +
        `</section>`
      )
    }
    for (const [h, v] of [['Overall', twg.wrap.overall], ['Next steps', twg.wrap.next], ['Questions to discuss', twg.wrap.questions]] as [string, string][]) {
      if (v) sections.push(`<section style="margin:16px 0"><h2 style="font-size:18px;margin:0 0 4px">${h}</h2><p style="margin:0">${esc(v)}</p></section>`)
    }
    const title = esc(twg.frameworkTitle ?? 'Observation')
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} — Observation</title></head>` +
      `<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1f2937">` +
      `<h1 style="color:#003882;font-size:24px">${title} — Observation</h1>` +
      `<table style="border-collapse:collapse;margin:12px 0 4px">${meta.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>` +
      `${sections.join('')}</body></html>`
  }
  const downloadHtml = () => triggerDownload(buildSummaryHtml(), 'text/html;charset=utf-8;', 'html')

  if (!ready) return <div className="card h-64 animate-pulse bg-gray-100 max-w-3xl mx-auto" />
  if (!allowed) {
    return (
      <div className="max-w-3xl mx-auto card p-8 text-center">
        <p className="text-gray-700 font-medium">Observations are recorded by supervisors and admins.</p>
        <Link href="/dashboard/observations" className="btn-secondary text-sm mt-4 inline-block">Back to observations</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{twg.frameworkTitle ?? 'Observation'}</h1>
          <p className="text-sm text-gray-500">{MODES[twg.mode].label} · {MODES[twg.mode].time}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('badge', status === 'published' ? 'badge-green' : 'badge-yellow')}>
            {status === 'published' ? 'Published' : 'Draft'}
          </span>
          {savedAt && <span className="text-xs text-green-600">{savedAt === 'copied' ? 'Copied' : `Saved ${savedAt}`}</span>}
          <button onClick={() => saveObservation('draft')} disabled={saving} className="btn-secondary text-sm">Save draft</button>
          <Link href="/dashboard/observations" className="btn-ghost text-sm">Close</Link>
        </div>
      </div>

      <div className="flex gap-2">
        {STEPS.map(([key, label], i) => (
          <button key={key} onClick={() => setStep(key)} className={clsx('tab flex-1', step === key ? 'tab-active' : 'tab-inactive')}>
            <span className="opacity-60 mr-1">{i + 1}.</span>{label}
          </button>
        ))}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {frameworks.length === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          No frameworks exist yet. Create one under <Link href="/dashboard/frameworks" className="underline">Frameworks</Link> first.
        </div>
      )}

      {/* ── Setup ─────────────────────────────────────────────── */}
      {step === 'setup' && (
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Framework</label>
              <select
                className="input"
                value={frameworkId}
                onChange={(e) => selectFramework(frameworks, e.target.value)}
              >
                {frameworks.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Length of visit</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MODES) as ObsMode[]).map((m) => (
                  <button key={m} onClick={() => patch({ mode: m })} className={clsx('tab', twg.mode === m ? 'tab-active' : 'tab-inactive')}>
                    {MODES[m].label} <span className="opacity-60 ml-1 text-xs">{MODES[m].time}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{MODES[twg.mode].desc}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Teacher <span className="text-red-500">*</span></label>
                <PersonPicker profiles={profiles} exclude={userId ? [userId] : []} value={person} onChange={setPerson} placeholder="Search staff by name or title…" />
              </div>
              <div>
                <label className="label">Date &amp; time</label>
                <input type="datetime-local" className="input" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
              </div>
              <div>
                <label className="label">Course</label>
                <input className="input" placeholder="e.g. Spanish 2 · Grade 7" value={twg.course} onChange={(e) => patch({ course: e.target.value })} />
              </div>
              <div>
                <label className="label">Division</label>
                <select className="input" value={twg.division} onChange={(e) => patch({ division: e.target.value })}>
                  <option value="">Select division…</option>
                  {DIVISION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  {twg.division && !DIVISION_OPTIONS.includes(twg.division) && <option value={twg.division}>{twg.division}</option>}
                </select>
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <label className="label mb-0">Focus — which areas you&apos;ll look at</label>
            {domains.length === 0 ? (
              <p className="text-sm text-gray-400">This framework has no domains. Add some under Frameworks.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {domains.map((d) => {
                  const on = twg.categories.some((c) => c.id === d.id)
                  const color = catColor(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleCategory(d)}
                      className={clsx('text-left rounded-xl border p-3 transition-colors', on ? 'shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300')}
                      style={on ? { backgroundColor: `${color}12`, borderColor: color } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-semibold text-gray-900">{d.title}</span>
                        {on && <span className="ml-auto text-xs font-semibold" style={{ color }}>✓</span>}
                      </div>
                      {d.description && <p className="text-xs text-gray-500 mt-1">{d.description}</p>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {selectedFw?.title === TWG_FRAMEWORK_TITLE && (
            <div className="card p-5 space-y-3">
              <div>
                <label className="label mb-0">Discipline or division add-ons</label>
                <p className="text-xs text-gray-500 mt-0.5">Extra look-fors for the space, age group, or discipline. Each becomes a tag and joins the reference.</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ADDONS.map((ad) => {
                  const on = twg.categories.some((c) => c.id === ADDON_PREFIX + ad.key)
                  return (
                    <button key={ad.key} onClick={() => toggleAddon(ad.key)}
                      className={clsx('text-left rounded-xl border p-3 transition-colors', on ? 'border-navy-300 bg-navy-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300')}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{ad.name}</span>
                        {on && <span className="ml-auto text-xs font-semibold text-navy-700">✓</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{ad.hint}</p>
                    </button>
                  )
                })}
              </div>
              <div>
                <label className="label">Your own look-fors (one per line)</label>
                <textarea rows={3} className="input resize-none" placeholder="e.g. Uses the new listening routine from PD" value={twg.customLookfors} onChange={(e) => setCustomLookfors(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">For anything specific to this teacher or discipline the framework doesn&apos;t cover.</p>
              </div>
            </div>
          )}

          {twg.mode !== 'popin' && (
            <div className="card p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Pre-observation conversation</h3>
              {([
                ['focus', 'What the teacher wants feedback on'],
                ['objective', 'Lesson objective'],
                ['unit', 'Where this sits in the unit'],
                ['style', 'Anything about their style to keep in mind'],
              ] as [keyof TwgData['pre'], string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <textarea rows={2} className="input resize-none" value={twg.pre[k]} onChange={(e) => patch({ pre: { ...twg.pre, [k]: e.target.value } })} />
                </div>
              ))}
            </div>
          )}

          {twg.categories.length > 0 && (
            <>
              <button onClick={() => setShowFramework((s) => !s)} className="text-sm font-medium text-navy-800 hover:underline">
                {showFramework ? '▾ Hide' : '▸ Show'} the framework reference &amp; look-fors
              </button>
              {showFramework && (
                <div className="card p-4 space-y-2">
                  {selectedFw?.description && <p className="text-sm italic text-gray-600 px-1">{selectedFw.description}</p>}
                  {twg.categories.map((c) => {
                    const open = openRefs.has(c.id)
                    const color = catColor(c.id)
                    const desc = catDescription(c.id)
                    const inds = indicatorsFor(c.id)
                    return (
                      <div key={c.id} className="rounded-lg border border-gray-200 overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: color }}>
                        <button onClick={() => toggleSet(setOpenRefs, c.id)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50">
                          <span className="font-semibold text-gray-900">{c.title}</span>
                          <span className="ml-auto text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                          <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                            {desc && <p className="text-sm text-gray-600 mb-2">{desc}</p>}
                            {inds.length > 0 && (
                              <ul className="list-disc pl-5 text-sm text-gray-500 space-y-0.5">
                                {inds.map((ind) => <li key={ind.id}>{ind.title}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end">
            <button onClick={() => setStep('notes')} className="btn-primary">Start notes →</button>
          </div>
        </div>
      )}

      {/* ── Live notes ────────────────────────────────────────── */}
      {step === 'notes' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold tabular-nums text-navy-900">{formatElapsed(elapsed)}</span>
              <div className="flex gap-2">
                {startedAt == null && <button onClick={() => setStartedAt(Date.now())} className="btn-secondary text-sm">Start timer</button>}
                {startedAt != null && stoppedAt == null && <button onClick={() => setStoppedAt(Date.now())} className="btn-secondary text-sm">Stop</button>}
                {stoppedAt != null && <button onClick={() => setStoppedAt(null)} className="btn-secondary text-sm">Resume</button>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {WHO_ORDER.map((w) => (
                <button key={w || 'note'} onClick={() => setNextWho(w)} className={clsx('tab', nextWho === w ? 'tab-active' : 'tab-inactive')}>{WHO[w]}</button>
              ))}
            </div>

            {tagOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((o) => {
                  const on = nextTags.includes(o.id)
                  const color = catColor(o.id)
                  return (
                    <button key={o.id} onClick={() => toggleNextTag(o.id)} title={o.title} className="badge cursor-pointer border"
                      style={on ? { backgroundColor: color, color: '#fff', borderColor: color } : { backgroundColor: `${color}12`, color: '#374151', borderColor: `${color}55` }}>
                      {o.title}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-gray-100">
              <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Key</span>
              {twg.categories.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: catColor(c.id) }} />
                  {c.title}
                </span>
              ))}
            </div>

            <textarea
              ref={composerRef}
              rows={3}
              className="input resize-none"
              placeholder="Type what you notice, then Add note (⌘/Ctrl+Enter)…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }}
            />
            <div className="flex justify-end">
              <button onClick={addNote} disabled={!draft.trim()} className="btn-primary text-sm">Add note</button>
            </div>
          </div>

          <div className="space-y-2">
            {twg.notes.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No notes yet. Tag the whole note, or select a portion to tag just that part.</p>}
            {twg.notes.length > 0 && <p className="text-xs text-gray-400">Select any portion of a note to tag it; click a highlight to remove it.</p>}
            {twg.notes.map((n) => {
              const segs = segmentsFromSpans(n.text, n.spans)
              let pos = 0
              return (
                <div key={n.id} className="card p-3 flex items-start gap-3">
                  <span className="text-xs tabular-nums text-gray-400 shrink-0 mt-0.5 w-12">{formatElapsed(n.t)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800">
                      {n.who && WHO[n.who] && <span className="text-gray-400 mr-1 select-none">({WHO[n.who]})</span>}
                      <span className="leading-relaxed" onMouseUp={(e) => beginAnnotate(n.id, e.currentTarget)}>
                        {segs.map((seg, i) => {
                          const a = pos, b = pos + seg.text.length; pos = b
                          if (seg.tags.length === 0) return <span key={i}>{seg.text}</span>
                          const color = catColor(seg.tags[0])
                          const label = seg.tags.map((k) => catTitle(k)).join(', ')
                          return (
                            <mark key={i} title={`${label} — click to remove`} onClick={() => removeSpanAt(n.id, a, b)}
                              className="rounded px-0.5 cursor-pointer"
                              style={{ backgroundColor: `${color}22`, borderBottom: `2px solid ${color}`, color: 'inherit' }}>{seg.text}</mark>
                          )
                        })}
                      </span>
                    </div>

                    {annot?.noteId === n.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 bg-navy-50 border border-navy-200 rounded-lg p-2">
                        <span className="text-xs text-gray-500 mr-1">Tag selection:</span>
                        {twg.categories.map((c) => {
                          const on = annotTags.includes(c.id)
                          const color = catColor(c.id)
                          return (
                            <button key={c.id} title={c.title} className="badge cursor-pointer border"
                              onClick={() => setAnnotTags((tg) => tg.includes(c.id) ? tg.filter((x) => x !== c.id) : [...tg, c.id])}
                              style={on ? { backgroundColor: color, color: '#fff', borderColor: color } : { backgroundColor: `${color}12`, color: '#374151', borderColor: `${color}55` }}>
                              {c.title}
                            </button>
                          )
                        })}
                        <button onClick={applySpan} disabled={annotTags.length === 0} className="btn-primary text-xs py-1 px-2 ml-1">Tag</button>
                        <button onClick={() => setAnnot(null)} className="btn-ghost text-xs py-1 px-2">Cancel</button>
                      </div>
                    )}

                    {n.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {n.tags.map((k) => <span key={k} className="badge badge-gray text-[10px]">{catTitle(k)}</span>)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-500 text-sm shrink-0">✕</button>
                </div>
              )
            })}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('setup')} className="btn-secondary">← Set up</button>
            <button onClick={() => { if (startedAt != null && stoppedAt == null) setStoppedAt(Date.now()); setStep('analysis') }} className="btn-primary">Analysis →</button>
          </div>
        </div>
      )}

      {/* ── Analysis ──────────────────────────────────────────── */}
      {step === 'analysis' && (
        <div className="space-y-4">
          {twg.categories.length === 0 && <p className="text-sm text-gray-500">No areas selected — add some back in Set up to structure your analysis.</p>}
          {twg.categories.map((c) => {
            const a = twg.analysis[c.id] ?? { strengths: '', growth: '', flag: false }
            const tagged = twg.notes.flatMap((n) => excerptsForNote(n, c.id).map((ex) => ({ t: n.t, ex })))
            const color = catColor(c.id)
            const inds = indicatorsFor(c.id)
            const checked = twg.checks?.[c.id] ?? []
            const evidenceOpen = openEvidence.has(c.id)
            const dom = domains.find((d) => d.id === c.id)
            return (
              <div key={c.id} className="card overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ backgroundColor: `${color}14`, borderBottom: `2px solid ${color}` }}>
                  <div>
                    <p className="font-bold text-gray-900">{c.title}</p>
                    {dom?.description && <p className="text-xs text-gray-500">{dom.description}</p>}
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer shrink-0">
                    <input type="checkbox" checked={a.flag} onChange={(e) => setAnalysis(c.id, { flag: e.target.checked })} />
                    Flag for follow-up
                  </label>
                </div>

                <div className="p-5 space-y-3">
                  {tagged.length > 0 && (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <button onClick={() => toggleSet(setOpenEvidence, c.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evidence from your notes ({tagged.length})</span>
                        <span className="ml-auto text-gray-400 text-xs">{evidenceOpen ? '▲' : '▼'}</span>
                      </button>
                      {evidenceOpen && (
                        <div className="px-3 pb-2 pt-1 border-t border-gray-100 space-y-1">
                          {tagged.map((e, i) => <p key={i} className="text-xs text-gray-600"><span className="tabular-nums text-gray-400">{formatElapsed(e.t)}</span> — {e.ex}</p>)}
                        </div>
                      )}
                    </div>
                  )}

                  {inds.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Look-fors you noticed</p>
                      <div className="space-y-1">
                        {inds.map((ind) => (
                          <label key={ind.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" className="mt-0.5 shrink-0" checked={checked.includes(ind.title)} onChange={() => toggleCheck(c.id, ind.title)} />
                            {ind.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Strengths noticed</label>
                    <textarea rows={2} className="input resize-none" placeholder="What went well, with evidence" value={a.strengths} onChange={(e) => setAnalysis(c.id, { strengths: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Growth and support</label>
                    <textarea rows={2} className="input resize-none" placeholder="Where the teacher could grow, or what support would help" value={a.growth} onChange={(e) => setAnalysis(c.id, { growth: e.target.value })} />
                  </div>
                </div>
              </div>
            )
          })}

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Wrap-up</h3>
            {([
              ['overall', 'Overall'],
              ['next', 'Next steps'],
              ['questions', 'Questions to discuss together'],
            ] as [keyof TwgData['wrap'], string][]).map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <textarea rows={2} className="input resize-none" value={twg.wrap[k]} onChange={(e) => patch({ wrap: { ...twg.wrap, [k]: e.target.value } })} />
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('notes')} className="btn-secondary">← Live notes</button>
            <button onClick={() => setStep('share')} className="btn-primary">Share →</button>
          </div>
        </div>
      )}

      {/* ── Share ─────────────────────────────────────────────── */}
      {step === 'share' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Teacher-facing summary</h3>
            <p className="text-sm text-gray-500">Save it to the platform, then publish to share with the teacher.</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={shareLookfors} onChange={(e) => setShareLookfors(e.target.checked)} /> Include look-fors noticed
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={shareNotes} onChange={(e) => setShareNotes(e.target.checked)} /> Include timestamped notes
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={shareFlags} onChange={(e) => setShareFlags(e.target.checked)} /> Include follow-up flags
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => saveObservation('draft')} disabled={saving} className="btn-secondary text-sm">{saving ? 'Saving…' : 'Save draft'}</button>
              <button onClick={publish} disabled={saving} className="btn-primary text-sm">{status === 'published' ? 'Re-publish & notify' : 'Publish & notify teacher'}</button>
              <button onClick={copySummary} className="btn-secondary text-sm">Copy summary</button>
              <button onClick={downloadHtml} className="btn-secondary text-sm">Download (.html)</button>
              <button onClick={downloadSummary} className="btn-secondary text-sm">Download (.md)</button>
            </div>
            {notice && <p className="text-sm text-navy-800 bg-navy-50 border border-navy-200 rounded-lg p-3">{notice}</p>}
            {status === 'draft' && <p className="text-xs text-gray-400">Drafts are private to you — the teacher sees the observation only after you publish.</p>}
          </div>

          <div className="card p-5">
            {hasSummary ? (
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{summaryMarkdown}</pre>
            ) : (
              <p className="text-gray-400 text-sm">Add strengths, growth, and next steps in Analysis to fill out this summary.</p>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('analysis')} className="btn-secondary">← Analysis</button>
            {obsId && <Link href="/dashboard/observations" className="btn-primary">Done</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
