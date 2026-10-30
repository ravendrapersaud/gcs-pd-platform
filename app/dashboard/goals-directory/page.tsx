'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Profile, GoalStatus } from '@/lib/types'
import { DIVISION_OPTIONS } from '@/lib/taxonomy'
import { departmentGroups, type DepartmentGroup } from '@/lib/appSettings'

type Row = Goal & { owner?: Profile }

const STATUS_OPTIONS: GoalStatus[] = ['active', 'completed', 'paused', 'archived']
const statusColor: Record<string, string> = {
  active: 'badge-green', completed: 'badge-navy', archived: 'badge-gray', paused: 'badge-yellow',
}

// School-wide directory of every goal, for admins. Filterable by the owner's
// division and department, plus status, type, and a free-text search. Goals
// carry no division/subject of their own, so those come from the owner profile.
export default function GoalsDirectoryPage() {
  const supabase = createClient()
  const [role, setRole] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [deptGroups, setDeptGroups] = useState<DepartmentGroup[]>(() => departmentGroups(null))
  const [loading, setLoading] = useState(true)

  const [division, setDivision] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    setRole(me?.role ?? 'staff')

    const [{ data: goals }, { data: profs }, { data: settings }] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('last_name'),
      supabase.from('app_settings').select('key, value'),
    ])
    const profById = new Map((profs ?? []).map((p) => [p.id, p as Profile]))
    setRows((goals ?? []).map((g) => ({ ...(g as Goal), owner: profById.get((g as Goal).owner_id) })))
    setDeptGroups(departmentGroups(settings))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter((r) => {
    if (division && r.owner?.division !== division) return false
    if (department && r.owner?.department !== department) return false
    if (status && r.status !== status) return false
    if (type && r.goal_type !== type) return false
    if (q.trim()) {
      const hay = `${r.owner?.first_name ?? ''} ${r.owner?.last_name ?? ''} ${r.owner?.title ?? ''} ${r.title}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  }), [rows, division, department, status, type, q])

  // Departments present in the data but not in the configured lists.
  const otherDepts = useMemo(() => {
    const known = new Set(deptGroups.flatMap((g) => g.options))
    return Array.from(new Set(rows.map((r) => r.owner?.department).filter((d): d is string => !!d && !known.has(d)))).sort()
  }, [rows, deptGroups])

  const hasFilters = division || department || status || type || q.trim()
  const clear = () => { setDivision(''); setDepartment(''); setStatus(''); setType(''); setQ('') }

  if (role && role !== 'admin') {
    return (
      <div className="max-w-[1180px] mx-auto">
        <div className="card p-8 text-center text-gray-600">The Goals Directory is available to administrators.</div>
      </div>
    )
  }

  return (
    <div className="max-w-[1180px] mx-auto space-y-5">
      <p className="text-sm text-gray-500">Every goal across the school. Filter by division, department, status, or search by name.</p>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Division</label>
            <select className="input" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">All divisions</option>
              {DIVISION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {deptGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              ))}
              {otherDepts.length > 0 && (
                <optgroup label="Other (in use)">
                  {otherDepts.map((o) => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Any type</option>
              <option value="standard">Standard</option>
              <option value="faculty_inquiry">Faculty inquiry</option>
            </select>
          </div>
          <div>
            <label className="label">Search</label>
            <input className="input" placeholder="Name, title, or goal…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-gray-500">{filtered.length} of {rows.length} goals</p>
          {hasFilters && <button onClick={clear} className="text-sm text-navy-700 hover:underline font-medium">Clear filters</button>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card h-64 animate-pulse bg-gray-100" />
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">No goals match these filters.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Division</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Goal</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 whitespace-nowrap">
                      {r.owner ? `${r.owner.first_name} ${r.owner.last_name}` : 'Unknown'}
                    </p>
                    {r.owner?.title && <p className="text-xs text-gray-400 whitespace-nowrap">{r.owner.title}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.owner?.division || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.owner?.department || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-sm"><span className="line-clamp-2">{r.title}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.goal_type === 'faculty_inquiry' ? 'Inquiry' : 'Standard'}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusColor[r.status]} capitalize`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.progress_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
