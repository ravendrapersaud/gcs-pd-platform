'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import clsx from 'clsx'

// Standalone competency-coverage dashboard for supervisors & admins. It
// aggregates competency_evidence across *all* frameworks (the per-framework
// Coverage card lives on each framework's detail page). RLS scopes every row:
// admins see everyone, supervisors see their reports. Two views:
//   • By area   — framework → domain → who has evidence (the cross-framework roll-up)
//   • By person — each person in scope, with how much is evidenced and the gaps
// Read-only; no writes here.

type EvidenceRow = {
  id: string
  subject_id: string
  framework_id: string
  domain_id: string
  indicator_id: string | null
  source: string
  created_at: string
  subject: { first_name: string; last_name: string; title: string | null; department: string | null } | null
  framework: { title: string } | null
  domain: { title: string } | null
}

type FrameworkLite = { id: string; title: string; domains: { id: string; title: string }[] }
type RosterPerson = { id: string; first_name: string; last_name: string; title: string | null; department: string | null }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`

export default function CompetenciesDashboardPage() {
  const supabase = createClient()
  const [role, setRole] = useState<string | null>(null)
  const [rows, setRows] = useState<EvidenceRow[]>([])
  const [frameworks, setFrameworks] = useState<FrameworkLite[]>([])
  const [roster, setRoster] = useState<RosterPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'area' | 'person'>('area')
  const [fwFilter, setFwFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setLoading(false); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const myRole = (me?.role as string) ?? 'staff'
    setRole(myRole)
    if (!(myRole === 'admin' || myRole === 'supervisor')) { setLoading(false); return }

    // Evidence (RLS-scoped) + frameworks for denominators. The roster of people
    // this viewer is responsible for drives the "by person" gaps view: admins
    // see everyone, supervisors see their assigned reports.
    const [{ data: ev, error: evErr }, { data: fws }, { data: assigns }] = await Promise.all([
      supabase.from('competency_evidence')
        .select('id, subject_id, framework_id, domain_id, indicator_id, source, created_at, subject:profiles!competency_evidence_subject_id_fkey(first_name, last_name, title, department), framework:frameworks(title), domain:framework_domains(title)')
        .order('created_at', { ascending: false }),
      supabase.from('frameworks').select('id, title, domains:framework_domains(id, title)').order('title'),
      myRole === 'supervisor'
        ? supabase.from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id)
        : Promise.resolve({ data: null }),
    ])
    if (evErr) { setError(evErr.message); setLoading(false); return }
    setRows((ev ?? []) as unknown as EvidenceRow[])
    setFrameworks((fws ?? []) as unknown as FrameworkLite[])

    if (myRole === 'admin') {
      const { data: all } = await supabase.from('profiles').select('id, first_name, last_name, title, department').order('first_name')
      setRoster((all ?? []) as RosterPerson[])
    } else {
      const ids = ((assigns ?? []) as { staff_id: string }[]).map((a) => a.staff_id)
      if (ids.length > 0) {
        const { data: ppl } = await supabase.from('profiles').select('id, first_name, last_name, title, department').in('id', ids).order('first_name')
        setRoster((ppl ?? []) as RosterPerson[])
      } else {
        setRoster([])
      }
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filteredRows = useMemo(
    () => (fwFilter ? rows.filter((r) => r.framework_id === fwFilter) : rows),
    [rows, fwFilter]
  )

  // ── By-area grouping: framework → domain → subject → rows ──
  const byArea = useMemo(() => {
    const fwMap = new Map<string, { title: string; domains: Map<string, { title: string; subjects: Map<string, EvidenceRow[]> }> }>()
    for (const r of filteredRows) {
      if (!fwMap.has(r.framework_id)) fwMap.set(r.framework_id, { title: r.framework?.title ?? 'Framework', domains: new Map() })
      const fw = fwMap.get(r.framework_id)!
      if (!fw.domains.has(r.domain_id)) fw.domains.set(r.domain_id, { title: r.domain?.title ?? 'Area', subjects: new Map() })
      const d = fw.domains.get(r.domain_id)!
      d.subjects.set(r.subject_id, [...(d.subjects.get(r.subject_id) ?? []), r])
    }
    return fwMap
  }, [filteredRows])

  // ── By-person rollup: each roster person with evidence tallies + gaps ──
  const byPerson = useMemo(() => {
    const perPerson = new Map<string, { domains: Set<string>; frameworks: Set<string>; items: number; last: string | null }>()
    for (const r of filteredRows) {
      if (!perPerson.has(r.subject_id)) perPerson.set(r.subject_id, { domains: new Set(), frameworks: new Set(), items: 0, last: null })
      const p = perPerson.get(r.subject_id)!
      p.domains.add(r.domain_id)
      p.frameworks.add(r.framework_id)
      p.items += 1
      if (!p.last || r.created_at > p.last) p.last = r.created_at
    }
    // A subject may appear in evidence without being in the roster (e.g. a
    // report reassigned); fold those in using the evidence's own name.
    const rosterIds = new Set(roster.map((p) => p.id))
    const extra: RosterPerson[] = []
    for (const r of filteredRows) {
      if (!rosterIds.has(r.subject_id) && !extra.some((e) => e.id === r.subject_id) && r.subject) {
        extra.push({ id: r.subject_id, first_name: r.subject.first_name, last_name: r.subject.last_name, title: r.subject.title, department: r.subject.department })
      }
    }
    const people = [...roster, ...extra]
    return people
      .map((p) => ({ person: p, stats: perPerson.get(p.id) }))
      .sort((a, b) => (b.stats?.items ?? 0) - (a.stats?.items ?? 0) || fullName(a.person).localeCompare(fullName(b.person)))
  }, [filteredRows, roster])

  const totalPeople = useMemo(() => new Set(filteredRows.map((r) => r.subject_id)).size, [filteredRows])
  const withEvidence = byPerson.filter((x) => (x.stats?.items ?? 0) > 0).length
  const noEvidence = byPerson.filter((x) => (x.stats?.items ?? 0) === 0).length

  if (loading) return <div className="max-w-4xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>

  if (!(role === 'admin' || role === 'supervisor')) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 text-center text-gray-600">
          Competency coverage is available to supervisors and administrators.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Summary + controls */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Competency coverage</h2>
          <p className="text-xs text-gray-400">
            Evidence across all frameworks{role === 'admin' ? ' for everyone' : ' for your reports'}, over time. Evidence is recorded via reviews and project tags — no scores.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-2xl font-display text-navy-800">{filteredRows.length}</p>
            <p className="text-xs text-gray-500">evidence items</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-2xl font-display text-navy-800">{totalPeople}</p>
            <p className="text-xs text-gray-500">{totalPeople === 1 ? 'person' : 'people'} with evidence</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className={clsx('text-2xl font-display', noEvidence > 0 ? 'text-yellow-700' : 'text-navy-800')}>{noEvidence}</p>
            <p className="text-xs text-gray-500">with none yet</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <button onClick={() => setView('area')} className={clsx('tab', view === 'area' ? 'tab-active' : 'tab-inactive')}>By area</button>
            <button onClick={() => setView('person')} className={clsx('tab', view === 'person' ? 'tab-active' : 'tab-inactive')}>By person</button>
          </div>
          <select className="input text-sm w-auto ml-auto" value={fwFilter} onChange={(e) => setFwFilter(e.target.value)}>
            <option value="">All frameworks</option>
            {frameworks.map((fw) => <option key={fw.id} value={fw.id}>{fw.title}</option>)}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 && view === 'area' ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          No competency evidence recorded yet. Evidence appears here once it&rsquo;s captured in a framework-linked review or tagged on a project.
        </div>
      ) : view === 'area' ? (
        <div className="space-y-5">
          {[...byArea.entries()].map(([fwId, fw]) => (
            <div key={fwId} className="card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">{fw.title}</h3>
                <Link href="/dashboard/frameworks" className="text-xs text-navy-700 hover:underline shrink-0">Open framework →</Link>
              </div>
              {[...fw.domains.values()].map((d, di) => (
                <div key={di} className="rounded-lg border border-gray-100 p-3 space-y-2">
                  <p className="font-medium text-gray-900 text-sm">
                    {d.title} <span className="text-gray-400 font-normal">· {d.subjects.size} {d.subjects.size === 1 ? 'person' : 'people'}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...d.subjects.values()].map((items, si) => {
                      const s = items[0].subject
                      const indCount = items.filter((x) => x.indicator_id).length
                      return (
                        <span key={si} className="inline-flex items-center gap-1 bg-navy-50 text-navy-800 border border-navy-100 rounded-full px-2 py-0.5 text-xs">
                          {s ? fullName(s) : 'Someone'}
                          <span className="text-navy-400">· {indCount || items.length}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">By person <span className="text-gray-400 font-normal">({byPerson.length})</span></h3>
            <p className="text-xs text-gray-400">{withEvidence} with evidence · {noEvidence} without</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 px-3 font-medium text-right">Areas</th>
                  <th className="py-2 px-3 font-medium text-right">Frameworks</th>
                  <th className="py-2 px-3 font-medium text-right">Items</th>
                  <th className="py-2 pl-3 font-medium text-right">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byPerson.map(({ person, stats }) => {
                  const none = (stats?.items ?? 0) === 0
                  return (
                    <tr key={person.id} className={clsx(none && 'bg-yellow-50/40')}>
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/portfolio/${person.id}`} className="text-gray-800 hover:text-navy-800">{fullName(person)}</Link>
                        {person.title && <span className="text-gray-400 text-xs"> · {person.title}</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">{stats?.domains.size ?? 0}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{stats?.frameworks.size ?? 0}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{stats?.items ?? 0}</td>
                      <td className="py-2 pl-3 text-right text-gray-400 text-xs">
                        {none ? <span className="badge badge-yellow">No evidence yet</span> : stats?.last ? fmtDate(stats.last) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
