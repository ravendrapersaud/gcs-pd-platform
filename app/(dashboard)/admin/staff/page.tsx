'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface StaffRow extends Profile {
  supervisors: string
  pdHours: number
}

export default function StaffRosterPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [search, setSearch] = useState('')
  const [divFilter, setDivFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StaffRow | null>(null)
  const [editForm, setEditForm] = useState<Partial<Profile>>({})
  const [saving, setSaving] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [supervisorId, setSupervisorId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: profiles }, { data: assignments }, { data: pdActs }] = await Promise.all([
      supabase.from('profiles').select('*').order('last_name'),
      supabase
        .from('supervisor_assignments')
        .select('staff_id, supervisor_id, is_primary, supervisor:profiles!supervisor_assignments_supervisor_id_fkey(first_name, last_name)'),
      supabase
        .from('pd_activities')
        .select('user_id, hours')
        .gte('activity_date', `${new Date().getFullYear()}-01-01`),
    ])

    const hoursMap: Record<string, number> = {}
    for (const act of pdActs ?? []) {
      hoursMap[act.user_id] = (hoursMap[act.user_id] ?? 0) + (act.hours ?? 0)
    }

    const supervisorMap: Record<string, string[]> = {}
    for (const a of assignments ?? []) {
      const sup = a.supervisor as { first_name: string; last_name: string } | null
      if (!sup) continue
      const name = `${sup.first_name} ${sup.last_name}${a.is_primary ? ' (Primary)' : ''}`
      supervisorMap[a.staff_id] = [...(supervisorMap[a.staff_id] ?? []), name]
    }

    const rows: StaffRow[] = (profiles ?? []).map((p) => ({
      ...(p as Profile),
      supervisors: (supervisorMap[p.id] ?? []).join(', ') || '—',
      pdHours: hoursMap[p.id] ?? 0,
    }))

    setStaff(rows)
    setAllProfiles((profiles ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const divisions = Array.from(new Set(staff.map((s) => s.division).filter(Boolean))).sort() as string[]

  const filtered = staff.filter((s) => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
      (s.title ?? '').toLowerCase().includes(search.toLowerCase())
    const matchDiv = !divFilter || s.division === divFilter
    return matchSearch && matchDiv
  })

  const openDetail = (row: StaffRow) => {
    setSelected(row)
    setEditForm({
      first_name: row.first_name,
      last_name: row.last_name,
      title: row.title ?? '',
      division: row.division ?? '',
      department: row.department ?? '',
      role: row.role,
    })
    setSupervisorId('')
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    await supabase.from('profiles').update({
      title: editForm.title ?? null,
      division: editForm.division ?? null,
      department: editForm.department ?? null,
      role: editForm.role,
    }).eq('id', selected.id)

    if (supervisorId) {
      await supabase.from('supervisor_assignments').upsert({
        staff_id: selected.id,
        supervisor_id: supervisorId,
        is_primary: true,
      }, { onConflict: 'staff_id,supervisor_id' })
    }

    setSaving(false)
    setSelected(null)
    load()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Selected staff drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-900">
                {selected.first_name} {selected.last_name}
              </h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" value={editForm.title ?? ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div>
                <label className="label">Division</label>
                <input className="input" value={editForm.division ?? ''} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })} />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={editForm.department ?? ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={editForm.role ?? 'staff'} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Profile['role'] })}>
                  <option value="staff">Staff</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Set Primary Supervisor</label>
                <select className="input" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                  <option value="">Keep existing</option>
                  {allProfiles.filter((p) => p.id !== selected.id && (p.role === 'supervisor' || p.role === 'admin')).map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Read-only info */}
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Current supervisor(s):</span>
                  <span className="text-gray-700 text-right">{selected.supervisors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">PD hours this year:</span>
                  <span className="font-bold text-navy-900">{selected.pdHours.toFixed(1)}h</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search staff…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
        <select className="input sm:w-48" value={divFilter} onChange={(e) => setDivFilter(e.target.value)}>
          <option value="">All Divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card h-64 animate-pulse bg-gray-100" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Dept</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Supervisor(s)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">PD Hrs</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(s)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                          <span className="text-navy-700 text-xs font-bold">
                            {s.first_name?.[0]}{s.last_name?.[0]}
                          </span>
                        </div>
                      )}
                      <span className="font-medium text-gray-900">
                        {s.first_name} {s.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{s.title ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{s.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">{s.supervisors}</td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-800">{s.pdHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge capitalize ${
                      s.role === 'admin' ? 'badge-red' : s.role === 'supervisor' ? 'badge-navy' : 'badge-gray'
                    }`}>
                      {s.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center py-12 text-gray-400">No staff match your filters.</p>
          )}
        </div>
      )}
    </div>
  )
}
