'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatUSD } from '@/lib/funds'
import { buildPortfolioHtml } from '@/lib/portfolioPrint'
import clsx from 'clsx'

type Named = { first_name: string; last_name: string } | null
export interface PortfolioData {
  profile: {
    first_name: string; last_name: string; title: string | null
    division: string | null; department: string | null; role: string
    employee_type: string | null; avatar_url: string | null; email: string
  }
  year: { start: string; end: string; label: string; value: number }
  goals: { id: string; title: string; goal_type: string; status: string; progress_pct: number; due_date: string | null; created_at: string }[]
  observations: { id: string; obs_type: string | null; observed_at: string; notes: string | null; twg_data: { frameworkTitle?: string } | null; observer: Named }[]
  shoutouts: { id: string; message: string; tags: string[]; created_at: string; sender: Named }[]
  pd: { activities: { id: string; title: string; type: string | null; activity_date: string; hours: number; verified: boolean }[]; hoursTotal: number; target: number }
  funding: { id: string; title: string; amount: number; status: string; is_overseas_travel: boolean; created_at: string }[]
}

const statusColor: Record<string, string> = {
  active: 'badge-green', completed: 'badge-navy', paused: 'badge-yellow', archived: 'badge-gray',
  approved: 'badge-green', denied: 'badge-red', pending: 'badge-yellow',
}
const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function currentSchoolYear(): number {
  const d = new Date()
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-3">{title} <span className="text-gray-400 font-normal">({count})</span></h3>
      {count === 0 ? <p className="text-sm text-gray-400">Nothing recorded this year.</p> : children}
    </div>
  )
}

export default function PortfolioPage() {
  const params = useParams()
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
              <h1 className="text-2xl font-display text-gray-900 truncate">{name}</h1>
              <p className="text-gray-500 text-sm">
                {[p.title, p.division, p.department].filter(Boolean).join(' · ') || '—'}
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
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">PD hours</p>
          <p className="text-2xl font-bold text-navy-900">{data.pd.hoursTotal}<span className="text-sm font-normal text-gray-400"> / {data.pd.target}</span></p>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-navy-900 rounded-full" style={{ width: `${pct}%` }} /></div>
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
      <Section title="Goals" count={data.goals.length}>
        <ul className="divide-y divide-gray-100">
          {data.goals.map((g) => (
            <li key={g.id} className="py-2 flex items-center gap-3">
              <span className={clsx('badge shrink-0', g.goal_type === 'faculty_inquiry' ? 'badge-navy' : 'badge-gray')}>{g.goal_type === 'faculty_inquiry' ? 'Inquiry' : 'Goal'}</span>
              <span className="flex-1 text-sm text-gray-800 min-w-0">{g.title}</span>
              <span className={clsx('badge shrink-0 capitalize', statusColor[g.status] ?? 'badge-gray')}>{g.status}</span>
              <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{g.progress_pct}%</span>
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
              <p className="text-xs text-gray-500">by {o.observer ? `${o.observer.first_name} ${o.observer.last_name}` : '—'}</p>
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
      <Section title="PD activities & funding" count={data.pd.activities.length + data.funding.length}>
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

      <div className="pt-1">
        <Link href="/dashboard/admin/staff" className="text-sm text-navy-700 hover:underline">← Back to Roster</Link>
      </div>
    </div>
  )
}
