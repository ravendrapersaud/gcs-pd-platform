'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatUSD } from '@/lib/funds'
import { buildPortfolioHtml } from '@/lib/portfolioPrint'
import PortfolioPromptBlock from '@/components/PortfolioPromptBlock'
import CheckInCadence from '@/components/CheckInCadence'
import type { FormField } from '@/lib/types'
import { TRACK_LABELS, TRACK_BLURBS, type Track } from '@/lib/tracks'
import clsx from 'clsx'

type Named = { first_name: string; last_name: string } | null
export interface PortfolioData {
  profile: {
    id: string
    first_name: string; last_name: string; title: string | null
    division: string | null; department: string | null; role: string
    campus: string | null; employee_type: string | null; avatar_url: string | null; email: string
  }
  track: Track
  year: { start: string; end: string; label: string; value: number }
  viewer: { isSelf: boolean; privileged: boolean }
  goals: {
    id: string; title: string; goal_type: string; status: string; progress_pct: number; due_date: string | null; created_at: string
    scope?: string | null; parent_goal_id?: string | null
    parent?: { id: string; title: string; scope?: string | null } | null
    aligned_count?: number; aligned_avg_pct?: number; aligned_total?: number
  }[]
  projects: { id: string; title: string; status: string; progress_pct: number; target_date: string | null; visibility: string; school_year_start: number | null }[]
  observations: { id: string; obs_type: string | null; observed_at: string; notes: string | null; twg_data: { frameworkTitle?: string } | null; goal: { title: string } | null; observer: Named }[]
  shoutouts: { id: string; message: string; tags: string[]; created_at: string; sender: Named }[]
  pd: { activities: { id: string; title: string; type: string | null; activity_date: string; hours: number; verified: boolean }[]; hoursTotal: number; target: number }
  funding: { id: string; title: string; amount: number; status: string; is_overseas_travel: boolean; created_at: string }[]
  forms: { id: string; submitted_at: string | null; created_at: string; answers: Record<string, unknown>; editable?: boolean; template: { id: string; title: string; fields: FormField[]; visible_to_employee: boolean; category?: string } | null; filler: Named }[]
  fillable: { id: string; title: string; fill_by: string; category?: string }[]
  competencies: {
    id: string; domain_id: string; indicator_id: string | null; source: string
    note: string | null; created_at: string
    framework: { title: string } | null; domain: { title: string } | null
    indicator: { title: string } | null; author: Named
  }[]
}

const statusColor: Record<string, string> = {
  active: 'badge-green', completed: 'badge-navy', paused: 'badge-yellow', archived: 'badge-gray',
  approved: 'badge-green', denied: 'badge-red', pending: 'badge-yellow',
  planning: 'badge-gray', on_hold: 'badge-yellow', complete: 'badge-navy',
}
const projectStatusLabel: Record<string, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', complete: 'Complete', archived: 'Archived',
}
const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function currentSchoolYear(): number {
  const d = new Date()
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

function Section({ title, count, prompt, children }: { title: string; count: number; prompt?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-3">{title} <span className="text-gray-400 font-normal">({count})</span></h3>
      {count === 0 ? (prompt ?? <p className="text-sm text-gray-400">Nothing recorded this year.</p>) : children}
    </div>
  )
}

// Competency evidence grouped framework → domain, across all time. Indicator
// evidence shows as checked items; domain-level narratives show as notes.
function CompetenciesByDomain({ items }: { items: PortfolioData['competencies'] }) {
  if (items.length === 0) return null
  type Row = PortfolioData['competencies'][number]
  const byFw = new Map<string, Map<string, Row[]>>()
  for (const it of items) {
    const fw = it.framework?.title ?? 'Framework'
    const dom = it.domain?.title ?? 'Area'
    if (!byFw.has(fw)) byFw.set(fw, new Map())
    const dm = byFw.get(fw)!
    dm.set(dom, [...(dm.get(dom) ?? []), it])
  }
  const who = (r: Row) => r.source === 'project'
    ? 'via a project'
    : (r.author ? `by ${r.author.first_name} ${r.author.last_name}` : 'review')
  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">Competencies <span className="text-gray-400 font-normal">({items.length})</span></h3>
        <p className="text-xs text-gray-400">Evidence grouped by area, across all time — from reviews and projects.</p>
      </div>
      {[...byFw.entries()].map(([fw, domains]) => (
        <div key={fw} className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-400">{fw}</p>
          {[...domains.entries()].map(([dom, rows]) => {
            const narratives = rows.filter((r) => !r.indicator_id && r.note)
            const inds = rows.filter((r) => r.indicator_id)
            return (
              <div key={dom} className="rounded-lg border border-gray-100 p-3 space-y-2">
                <p className="font-medium text-gray-900 text-sm">{dom}</p>
                {inds.length > 0 && (
                  <ul className="space-y-1.5">
                    {inds.map((r) => (
                      <li key={r.id} className="flex items-start gap-2 text-sm">
                        <span className="text-navy-700 mt-0.5 shrink-0">✓</span>
                        <div className="min-w-0">
                          <span className="text-gray-800">{r.indicator?.title}</span>
                          {r.note && <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-wrap">{r.note}</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">{who(r)} · {fmtDate(r.created_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {narratives.map((n) => (
                  <div key={n.id} className="text-sm bg-gray-50 rounded p-2">
                    <p className="text-gray-700 whitespace-pre-wrap">{n.note}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{who(n)} · {fmtDate(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Per-employee competency assignment: frameworks pinned to this person as a
// named focus (distinct from track/role targeting). The subject's supervisor /
// an admin can add & remove; everyone who can view the portfolio sees the list.
function FocusCompetencies({ subjectId, subjectFirstName, canAssign }: { subjectId: string; subjectFirstName: string; canAssign: boolean }) {
  const supabase = createClient()
  type Assignment = { id: string; framework_id: string; framework: { id: string; title: string } | null; assigner: { first_name: string; last_name: string } | null }
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [allFrameworks, setAllFrameworks] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rows, error: aErr }, fwRes] = await Promise.all([
      supabase.from('competency_assignments')
        .select('id, framework_id, framework:frameworks(id, title), assigner:profiles!competency_assignments_assigned_by_fkey(first_name, last_name)')
        .eq('subject_id', subjectId).order('created_at', { ascending: true }),
      canAssign ? supabase.from('frameworks').select('id, title').order('title') : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ])
    if (aErr) setError(aErr.message)
    setAssignments((rows ?? []) as unknown as Assignment[])
    setAllFrameworks((fwRes.data ?? []) as { id: string; title: string }[])
    setLoading(false)
  }, [subjectId, canAssign])
  useEffect(() => { load() }, [load])

  const add = async (frameworkId: string) => {
    if (!frameworkId) return
    setBusy(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); setError('Not signed in.'); return }
    const { data, error: err } = await supabase.from('competency_assignments')
      .insert({ subject_id: subjectId, framework_id: frameworkId, assigned_by: user.id }).select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('You don’t have permission to assign competencies to this person.'); return }
    load()
  }
  const remove = async (id: string) => {
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.from('competency_assignments').delete().eq('id', id).select('id')
    setBusy(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('You don’t have permission to remove this.'); return }
    load()
  }

  if (loading) return <div className="card p-5 h-20 animate-pulse bg-gray-100" />
  // Nothing to show and the viewer can't assign → don't clutter the portfolio.
  if (assignments.length === 0 && !canAssign) return null

  const assignedIds = new Set(assignments.map((a) => a.framework_id))
  const addable = allFrameworks.filter((f) => !assignedIds.has(f.id))

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">Focus competencies <span className="text-gray-400 font-normal">({assignments.length})</span></h3>
        <p className="text-xs text-gray-400">
          Frameworks set as a focus for {subjectFirstName}. They appear on {subjectFirstName}’s Frameworks list and can be tagged on their projects, so evidence can be gathered against them.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400">No focus competencies set.</p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="badge badge-navy shrink-0">Focus</span>
              <Link href="/dashboard/frameworks" className="flex-1 text-gray-800 hover:text-navy-800 min-w-0">{a.framework?.title ?? 'Framework'}</Link>
              {a.assigner && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">by {a.assigner.first_name} {a.assigner.last_name}</span>}
              {canAssign && <button onClick={() => remove(a.id)} disabled={busy} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {canAssign && addable.length > 0 && (
        <select className="input text-sm" value="" disabled={busy} onChange={(e) => { if (e.target.value) add(e.target.value) }}>
          <option value="">+ Assign a competency framework…</option>
          {addable.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      )}
    </div>
  )
}

function FormResponseCard({ r, subjectId }: { r: PortfolioData['forms'][number]; subjectId: string }) {
  const [open, setOpen] = useState(false)
  const fields = (r.template?.fields ?? []).filter((f) => f.type !== 'section')
  return (
    <li className="rounded-lg border border-gray-100 p-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{r.template?.title ?? 'Form'}</p>
          <p className="text-xs text-gray-400">by {r.filler ? `${r.filler.first_name} ${r.filler.last_name}` : '—'} · {fmtDate(r.submitted_at ?? r.created_at)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {r.editable && r.template && (
            <Link href={`/dashboard/forms/fill/${r.template.id}/${subjectId}?responseId=${r.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-navy-700 hover:underline">Edit</Link>
          )}
          <span className="text-xs text-navy-700">{open ? 'Hide' : 'View'}</span>
        </div>
      </button>
      {open && (
        <dl className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
          {fields.map((f) => {
            const v = r.answers[f.id]
            const text = Array.isArray(v) ? (v as string[]).join(', ') : (v == null || v === '' ? '—' : String(v))
            return (
              <div key={f.id} className="text-sm">
                <dt className="text-xs uppercase tracking-wide text-gray-400">{f.label}</dt>
                <dd className="text-gray-700 whitespace-pre-wrap">
                  {f.type === 'link' && text !== '—'
                    ? <a href={text} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline break-all">{text}</a>
                    : text}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </li>
  )
}

export default function PortfolioPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const supabase = createClient()

  const [year, setYear] = useState(currentSchoolYear())
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/portfolio?userId=${encodeURIComponent(id)}&year=${year}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Could not load this portfolio.'); setData(null); return }
      setData(body as PortfolioData)
    } catch {
      setError('Could not load this portfolio.')
    } finally {
      setLoading(false)
    }
  }, [id, year])
  useEffect(() => { load() }, [load])

  const years = Array.from({ length: 4 }, (_, i) => currentSchoolYear() - i)

  const print = () => {
    if (!data) return
    const w = window.open('', '_blank')
    if (!w) { setError('Allow pop-ups to open the printable portfolio.'); return }
    w.document.open(); w.document.write(buildPortfolioHtml(data)); w.document.close()
  }

  if (loading) return <div className="max-w-4xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>
  if (error) return (
    <div className="max-w-2xl mx-auto"><div className="card p-8 text-center text-gray-600">{error}</div></div>
  )
  if (!data) return null

  const p = data.profile
  const name = `${p.first_name} ${p.last_name}`
  const pct = data.pd.target > 0 ? Math.min(100, Math.round((data.pd.hoursTotal / data.pd.target) * 100)) : 0
  // Annual "fill out your portfolio" prompts: only for the owner, only for the
  // current school year — so each new year re-invites them to populate it.
  const canPrompt = data.viewer?.isSelf && year === currentSchoolYear()

  // Check-ins are a typed slice of Forms (template.category === 'check_in'),
  // shown in their own section. A check-in's prompt reaches the owner AND a
  // supervisor/admin viewing — since the conversation is a shared touchpoint.
  const isCheckIn = (c?: string) => c === 'check_in'
  const checkInResponses = data.forms.filter((r) => isCheckIn(r.template?.category))
  const otherResponses = data.forms.filter((r) => !isCheckIn(r.template?.category))
  const checkInFillable = data.fillable.filter((f) => isCheckIn(f.category))
  const otherFillable = data.fillable.filter((f) => !isCheckIn(f.category))
  const isCurrentYear = year === currentSchoolYear()
  const canCheckInPrompt = isCurrentYear && checkInFillable.length > 0 && (data.viewer?.isSelf || data.viewer?.privileged)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.avatar_url
              ? <img src={p.avatar_url} alt={name} className="w-14 h-14 rounded-full object-cover shrink-0" />
              : <div className="w-14 h-14 rounded-full bg-navy-900 text-white grid place-items-center font-semibold shrink-0">{p.first_name[0]}{p.last_name[0]}</div>}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-display text-gray-900 truncate">{name}</h1>
                <span className="badge badge-navy text-[11px]" title={TRACK_BLURBS[data.track]}>{TRACK_LABELS[data.track]}</span>
              </div>
              <p className="text-gray-500 text-sm">
                {[p.title, p.division, p.department, p.campus ? `Campus ${p.campus}` : null].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{p.employee_type ?? ''} · {p.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select className="input w-auto text-sm py-1.5" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}
            </select>
            <button onClick={print} className="btn-secondary text-sm">Print / Save PDF</button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Professional portfolio · School year {data.year.label} · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* PD engagement summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">PD hours</p>
          <p className="text-2xl font-bold text-navy-900">{data.pd.hoursTotal}<span className="text-sm font-normal text-gray-400"> / {data.pd.target}</span></p>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-navy-900 rounded-full" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Projects</p>
          <p className="text-2xl font-bold text-navy-900">{data.projects.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Observations</p>
          <p className="text-2xl font-bold text-navy-900">{data.observations.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Shout-outs</p>
          <p className="text-2xl font-bold text-navy-900">{data.shoutouts.length}</p>
        </div>
      </div>

      {/* Goals */}
      <Section
        title="Goals"
        count={data.goals.length}
        prompt={canPrompt ? <PortfolioPromptBlock title={`Set your goals for ${data.year.label}`} blurb="What do you want to grow, build, or accomplish this year?" cta="Set a goal" href="/dashboard/goals?new=1" /> : undefined}
      >
        <ul className="divide-y divide-gray-100">
          {data.goals.map((g) => {
            const isOrg = g.scope === 'office' || g.scope === 'school'
            const scopeLabel = g.scope === 'school' ? 'School' : g.scope === 'office' ? 'Department' : null
            return (
            <li key={g.id} className="py-2 space-y-1">
              <div className="flex items-center gap-3">
                <span className={clsx('badge shrink-0', isOrg ? 'badge-navy' : g.goal_type === 'faculty_inquiry' ? 'badge-navy' : 'badge-gray')}>
                  {scopeLabel ?? (g.goal_type === 'faculty_inquiry' ? 'Inquiry' : 'Goal')}
                </span>
                <span className="flex-1 text-sm text-gray-800 min-w-0">{g.title}</span>
                <span className={clsx('badge shrink-0 capitalize', statusColor[g.status] ?? 'badge-gray')}>{g.status}</span>
                <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{g.progress_pct}%</span>
              </div>
              {(g.parent || isOrg) && (
                <p className="text-xs text-gray-500 pl-1">
                  {g.parent && <>Aligns to <span className="text-navy-700">{g.parent.title}</span></>}
                  {g.parent && isOrg && (g.aligned_count ?? 0) > 0 && ' · '}
                  {isOrg && (g.aligned_count ?? 0) > 0 && (
                    <>
                      <span className="font-medium text-navy-700">{g.aligned_count}</span> aligned · avg {g.aligned_avg_pct ?? 0}%
                      {(g.aligned_total ?? 0) > (g.aligned_count ?? 0) && <> · {g.aligned_total} across all levels</>}
                    </>
                  )}
                </p>
              )}
            </li>
          )})}
        </ul>
      </Section>

      {/* Projects */}
      <Section
        title="Projects"
        count={data.projects.length}
        prompt={canPrompt ? <PortfolioPromptBlock title={`Start a project for ${data.year.label}`} blurb="Capture an initiative you're leading or contributing to — the work behind your goals." cta="New project" href={`/dashboard/projects?new=1&year=${year}`} /> : undefined}
      >
        <ul className="divide-y divide-gray-100">
          {data.projects.map((pr) => (
            <li key={pr.id} className="py-2 flex items-center gap-3">
              {pr.visibility === 'private' && <span className="shrink-0" title="Private">🔒</span>}
              <a href={`/dashboard/projects/${pr.id}`} className="flex-1 text-sm text-gray-800 hover:text-navy-800 min-w-0 truncate">{pr.title}</a>
              <span className={clsx('badge shrink-0', statusColor[pr.status] ?? 'badge-gray')}>{projectStatusLabel[pr.status] ?? pr.status}</span>
              <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{pr.progress_pct}%</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Observations */}
      <Section title="Formal observations" count={data.observations.length}>
        <ul className="divide-y divide-gray-100">
          {data.observations.map((o) => (
            <li key={o.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{o.twg_data?.frameworkTitle ?? 'Observation'}</span>
                <span className="text-xs text-gray-400 shrink-0">{fmtDate(o.observed_at)}</span>
              </div>
              <p className="text-xs text-gray-500">by {o.observer ? `${o.observer.first_name} ${o.observer.last_name}` : '—'}{o.goal ? <> · <span className="text-navy-700">evidence toward “{o.goal.title}”</span></> : null}</p>
              {o.notes && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{o.notes}</p>}
            </li>
          ))}
        </ul>
      </Section>

      {/* Shout-outs */}
      <Section title="Shout-outs received" count={data.shoutouts.length}>
        <ul className="space-y-2">
          {data.shoutouts.map((s) => (
            <li key={s.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">from {s.sender ? `${s.sender.first_name} ${s.sender.last_name}` : '—'}</span>
                <span className="text-xs text-gray-400">{fmtDate(s.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 mt-1 italic">“{s.message}”</p>
              {s.tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{s.tags.map((t) => <span key={t} className="badge badge-gray text-[10px]">{t}</span>)}</div>}
            </li>
          ))}
        </ul>
      </Section>

      {/* PD activities & funding */}
      <Section
        title="PD activities & funding"
        count={data.pd.activities.length + data.funding.length}
        prompt={canPrompt ? <PortfolioPromptBlock title={`Log your first PD of ${data.year.label}`} blurb="Record a conference, workshop, course, or reading you've engaged with." cta="Log PD" href="/dashboard/pd-log?new=1" /> : undefined}
      >
        {data.pd.activities.length > 0 && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">Activities logged</p>
            <ul className="divide-y divide-gray-100">
              {data.pd.activities.map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 shrink-0 w-20">{fmtDate(a.activity_date)}</span>
                  <span className="flex-1 text-gray-800 min-w-0 truncate">{a.title}</span>
                  {a.verified && <span className="badge badge-green text-[10px] shrink-0">verified</span>}
                  <span className="text-gray-700 shrink-0 tabular-nums">{a.hours}h</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.funding.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">Funding requests</p>
            <ul className="divide-y divide-gray-100">
              {data.funding.map((f) => (
                <li key={f.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 shrink-0 w-20">{fmtDate(f.created_at)}</span>
                  <span className="flex-1 text-gray-800 min-w-0 truncate">{f.title}{f.is_overseas_travel ? ' (overseas)' : ''}</span>
                  <span className={clsx('badge shrink-0 capitalize', statusColor[f.status] ?? 'badge-gray')}>{f.status}</span>
                  <span className="text-gray-700 shrink-0 tabular-nums">{formatUSD(Number(f.amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Check-in cadence (frequency + note slots) */}
      <CheckInCadence employeeId={p.id} employeeFirstName={p.first_name} />

      {/* Check-ins */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900">Check-ins <span className="text-gray-400 font-normal">({checkInResponses.length})</span></h3>
          {checkInFillable.length > 0 && (
            <select
              className="input text-sm py-1.5 w-auto"
              value=""
              onChange={(e) => { if (e.target.value) router.push(`/dashboard/forms/fill/${e.target.value}/${p.id}`) }}
            >
              <option value="">+ Start a check-in…</option>
              {checkInFillable.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          )}
        </div>
        {checkInResponses.length === 0 ? (
          canCheckInPrompt ? (
            <PortfolioPromptBlock
              title={data.viewer?.isSelf ? `Complete your ${data.year.label} check-in` : `Start a check-in with ${p.first_name}`}
              blurb={data.viewer?.isSelf ? 'A short reflection on how the year is going, to share with your supervisor.' : 'Open a 1:1 or review for this employee — their reflection and your notes land here.'}
              cta={data.viewer?.isSelf ? 'Start check-in' : 'Start a check-in'}
              href={`/dashboard/forms/fill/${checkInFillable[0].id}/${p.id}`}
            />
          ) : (
            <p className="text-sm text-gray-400">No check-ins recorded this year.</p>
          )
        ) : (
          <ul className="space-y-2">
            {checkInResponses.map((r) => <FormResponseCard key={r.id} r={r} subjectId={data.profile.id} />)}
          </ul>
        )}
      </div>

      {/* Focus competencies — frameworks assigned to this person */}
      <FocusCompetencies subjectId={p.id} subjectFirstName={p.first_name} canAssign={!!data.viewer?.privileged} />

      {/* Competencies — evidence grouped by domain, across all time */}
      <CompetenciesByDomain items={data.competencies} />

      {/* Forms */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900">Forms <span className="text-gray-400 font-normal">({otherResponses.length})</span></h3>
          {otherFillable.length > 0 && (
            <select
              className="input text-sm py-1.5 w-auto"
              value=""
              onChange={(e) => { if (e.target.value) router.push(`/dashboard/forms/fill/${e.target.value}/${p.id}`) }}
            >
              <option value="">+ Fill a form…</option>
              {otherFillable.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          )}
        </div>
        {otherResponses.length === 0 ? (
          <p className="text-sm text-gray-400">No forms on file{otherFillable.length > 0 ? ' yet — use “Fill a form” above.' : '.'}</p>
        ) : (
          <ul className="space-y-2">
            {otherResponses.map((r) => <FormResponseCard key={r.id} r={r} subjectId={data.profile.id} />)}
          </ul>
        )}
      </div>

      <div className="pt-1">
        <Link href="/dashboard/admin/staff" className="text-sm text-navy-700 hover:underline">← Back to Roster</Link>
      </div>
    </div>
  )
}
