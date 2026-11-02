'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { DIVISION_OPTIONS, CAMPUSES } from '@/lib/taxonomy'
import { departmentGroups, type DepartmentGroup } from '@/lib/appSettings'

// A directory of the people whose portfolios you may open — admins see the
// whole school; a supervisor sees their direct reports (plus themselves);
// anyone else sees just themselves. Filter by division / department / campus,
// then click through to the portfolio. Mirrors the School Goals directory.
export default function PortfoliosDirectoryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Profile[]>([])
  const [deptGroups, setDeptGroups] = useState<DepartmentGroup[]>(() => departmentGroups(null))
  const [loading, setLoading] = useState(true)

  const [division, setDivision] = useState('')
  const [department, setDepartment] = useState('')
  const [campus, setCampus] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: me }, { data: profs }, { data: settings }, { data: assignments }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('profiles').select('*').order('last_name'),
      supabase.from('app_settings').select('key, value'),
      supabase.from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id),
    ])

    const all = (profs ?? []) as Profile[]
    const role = me?.role ?? 'staff'
    let list = all
    if (role !== 'admin') {
      const ids = new Set<string>([user.id, ...((assignments ?? []).map((a) => a.staff_id as string))])
      list = all.filter((p) => ids.has(p.id))
    }
    setRows(list)
    setDeptGroups(departmentGroups(settings))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter((r) => {
    if (division && r.division !== division) return false
    if (department && r.department !== department) return false
    if (campus && (r.campus ?? '') !== campus) return false
    if (q.trim()) {
      const hay = `${r.first_name} ${r.last_name} ${r.title ?? ''}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  }), [rows, division, department, campus, q])

  const otherDepts = useMemo(() => {
    const known = new Set(deptGroups.flatMap((g) => g.options))
    return Array.from(new Set(rows.map((r) => r.department).filter((d): d is string => !!d && !known.has(d)))).sort()
  }, [rows, deptGroups])

  const hasFilters = division || department || campus || q.trim()
  const clear = () => { setDivision(''); setDepartment(''); setCampus(''); setQ('') }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">The people you oversee. Filter, then open a portfolio for a review or 1-on-1.</p>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Division</label>
            <select className="input" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">All divisions</option>
              {DIVISION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Campus</label>
            <select className="input" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All campuses</option>
              {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
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
            <label className="label">Search</label>
            <input className="input" placeholder="Name or title…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-gray-500">{filtered.length} of {rows.length} people</p>
          {hasFilters && <button onClick={clear} className="text-sm text-navy-700 hover:underline font-medium">Clear filters</button>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card h-64 animate-pulse bg-gray-100" />
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">No people match these filters.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Division</th>
                <th className="px-4 py-3 font-semibold">Campus</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold text-right">Portfolio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 whitespace-nowrap">{r.first_name} {r.last_name}</p>
                    {r.title && <p className="text-xs text-gray-400 whitespace-nowrap">{r.title}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.division || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.campus || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.department || '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/dashboard/portfolio/${r.id}`} className="text-navy-700 hover:underline font-medium">View portfolio →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
