'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { DIVISION_OPTIONS, DEPARTMENT_GROUPS } from '@/lib/taxonomy'
import { parseFundSettings, isInFundYear } from '@/lib/funds'
import { roleAccessLabel } from '@/lib/roles'
import clsx from 'clsx'

interface StaffRow extends Profile {
  supervisors: string
  primarySupEmail: string
  secondarySupEmail: string
  pdHours: number
}

// Columns exactly match the CSV import format, so exports can be re-imported.
const EXPORT_COLUMNS = [
  'employee_id', 'first_name', 'last_name', 'email', 'title',
  'division', 'department', 'employee_type', 'role',
  'primary_supervisor_email', 'secondary_supervisor_email',
] as const

export default function StaffRosterPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [search, setSearch] = useState('')
  const [divFilter, setDivFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | 'staff' | 'supervisor' | 'admin'>('')
  const [supFilter, setSupFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'faculty' | 'staff' | 'admin'>('')
  const [needsSetupOnly, setNeedsSetupOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  // Whether the signed-in user is a Platform Admin — gates the Access
  // (role) dropdowns, which only admins may change.
  const [isAdmin, setIsAdmin] = useState(false)
  const [selected, setSelected] = useState<StaffRow | null>(null)
  const [editForm, setEditForm] = useState<Partial<Profile>>({})
  const [allotmentInput, setAllotmentInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [supervisorId, setSupervisorId] = useState('')

  // ── Add-a-person drawer (single-user equivalent of CSV import) ─
  const emptyCreateForm = {
    first_name: '', last_name: '', email: '', title: '', division: '',
    department: '', employee_id: '', employee_type: '', role: 'staff',
    pd_allotment: '', supervisor_id: '',
  }
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: profiles }, { data: assignments }, { data: pdActs }, { data: settingsRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('last_name'),
      supabase
        .from('supervisor_assignments')
        .select('staff_id, supervisor_id, is_primary, supervisor:profiles!supervisor_assignments_supervisor_id_fkey(first_name, last_name, email)'),
      // Fetch from the earlier of the two fund-year starts, then filter per
      // person below. This column used to be a CALENDAR-year filter while
      // the UI called it "PD hours this year", so it disagreed with the
      // dashboards. Everything now uses each person's own fund year.
      supabase
        .from('pd_activities')
        .select('user_id, hours, activity_date')
        .gte('activity_date', `${new Date().getFullYear() - 1}-01-01`),
      supabase.from('app_settings').select('key, value'),
    ])

    const fundCfg = parseFundSettings(settingsRows)
    const typeById: Record<string, string | null> = {}
    for (const p of profiles ?? []) typeById[p.id] = (p as Profile).employee_type

    const hoursMap: Record<string, number> = {}
    for (const act of pdActs ?? []) {
      if (!isInFundYear(act.activity_date, typeById[act.user_id], fundCfg)) continue
      hoursMap[act.user_id] = (hoursMap[act.user_id] ?? 0) + (act.hours ?? 0)
    }

    const supervisorMap: Record<string, string[]> = {}
    const primaryEmailMap: Record<string, string> = {}
    const secondaryEmailMap: Record<string, string> = {}
    for (const a of assignments ?? []) {
      const sup = a.supervisor as unknown as { first_name: string; last_name: string; email: string } | null
      if (!sup) continue
      const name = `${sup.first_name} ${sup.last_name}${a.is_primary ? ' (Primary)' : ''}`
      supervisorMap[a.staff_id] = [...(supervisorMap[a.staff_id] ?? []), name]
      if (a.is_primary) primaryEmailMap[a.staff_id] = sup.email
      else secondaryEmailMap[a.staff_id] = sup.email
    }

    const rows: StaffRow[] = (profiles ?? []).map((p) => ({
      ...(p as Profile),
      supervisors: (supervisorMap[p.id] ?? []).join(', ') || '—',
      primarySupEmail: primaryEmailMap[p.id] ?? '',
      secondarySupEmail: secondaryEmailMap[p.id] ?? '',
      pdHours: hoursMap[p.id] ?? 0,
    }))

    const { data: { user } } = await supabase.auth.getUser()
    const me = (profiles ?? []).find((p) => p.id === user?.id) as Profile | undefined
    setIsAdmin(me?.role === 'admin')

    setStaff(rows)
    setAllProfiles((profiles ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Division options: canonical (4 divisions + All School) plus any others present in the data.
  const dataDivs = Array.from(new Set(staff.map((s) => s.division).filter(Boolean))) as string[]
  const divisions = [
    ...DIVISION_OPTIONS,
    ...dataDivs.filter((d) => !DIVISION_OPTIONS.includes(d)).sort(),
  ]

  const departments = Array.from(new Set(staff.map((s) => s.department).filter(Boolean))).sort() as string[]
  // Department values already in use that aren't in the canonical groups —
  // surfaced under an "Other" optgroup so existing data stays selectable.
  const canonicalDepts = new Set(DEPARTMENT_GROUPS.flatMap((g) => g.options))
  const otherDepts = departments.filter((d) => !canonicalDepts.has(d))
  const supervisorOptions = allProfiles
    .filter((p) => p.role === 'supervisor' || p.role === 'admin')
    .sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''))

  const filtered = staff.filter((s) => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
      (s.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? '').toLowerCase().includes(search.toLowerCase())
    const matchDiv = !divFilter || s.division === divFilter
    const matchDept = !deptFilter || s.department === deptFilter
    const matchRole = !roleFilter || s.role === roleFilter
    const matchSup = !supFilter ||
      s.primarySupEmail === supFilter || s.secondarySupEmail === supFilter
    const matchType = !typeFilter || (s.employee_type ?? '').toLowerCase() === typeFilter
    const matchSetup = !needsSetupOnly || s.needs_setup
    return matchSearch && matchDiv && matchDept && matchRole && matchSup && matchType && matchSetup
  })

  // ── Export (columns match the CSV import format) ─────────────
  const buildExportRows = () =>
    filtered.map((s) => ({
      employee_id: s.employee_id ?? '',
      first_name: s.first_name ?? '',
      last_name: s.last_name ?? '',
      email: s.email ?? '',
      title: s.title ?? '',
      division: s.division ?? '',
      department: s.department ?? '',
      employee_type: s.employee_type ?? '',
      role: s.role ?? '',
      primary_supervisor_email: s.primarySupEmail ?? '',
      secondary_supervisor_email: s.secondarySupEmail ?? '',
    }))

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const dateStamp = () => new Date().toISOString().split('T')[0]

  const exportCsv = () => {
    const rows = buildExportRows()
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [
      EXPORT_COLUMNS.join(','),
      ...rows.map((r) => EXPORT_COLUMNS.map((c) => esc(r[c])).join(',')),
    ]
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `gcs-staff-${dateStamp()}.csv`)
  }

  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const rows = buildExportRows()
    const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLUMNS as unknown as string[] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Staff')
    XLSX.writeFile(wb, `gcs-staff-${dateStamp()}.xlsx`)
  }

  const openDetail = (row: StaffRow) => {
    setSelected(row)
    setEditForm({
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      title: row.title ?? '',
      division: row.division ?? '',
      department: row.department ?? '',
      employee_id: row.employee_id ?? '',
      employee_type: row.employee_type ?? '',
      role: row.role,
      can_create_workspaces: row.can_create_workspaces ?? false,
    })
    setAllotmentInput(row.pd_allotment === null || row.pd_allotment === undefined ? '' : String(row.pd_allotment))
    setSupervisorId('')
    setSaveError(null)
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(createForm),
    })
    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      setCreateError(body.error ?? `Could not create this person (${res.status})`)
      setCreating(false)
      return
    }
    // Created, but the supervisor link failed — say so instead of
    // silently pretending everything worked.
    if (body.warning) setCreateError(body.warning)

    setCreating(false)
    if (!body.warning) {
      setShowCreate(false)
      setCreateForm({ ...emptyCreateForm })
    }
    load()
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setSaveError(null)

    // ── Identity changes (name/email) go through the admin API so
    //    the login credential stays in sync with the profile. ─────
    const identityChanged =
      editForm.first_name !== selected.first_name ||
      editForm.last_name !== selected.last_name ||
      editForm.email !== selected.email

    if (identityChanged) {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          user_id: selected.id,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          ...(editForm.email !== selected.email ? { email: editForm.email } : {}),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Identity update failed (${res.status})`)
        setSaving(false)
        return
      }
    }

    // .select() makes the update return the affected rows, so we can
    // detect a silent zero-row update (usually an RLS permission issue).
    const { data: updated, error } = await supabase.from('profiles').update({
      title: editForm.title ?? null,
      division: editForm.division ?? null,
      department: editForm.department ?? null,
      employee_id: editForm.employee_id?.trim() || null,
      employee_type: editForm.employee_type || null,
      pd_allotment: allotmentInput.trim() === '' ? null : Number(allotmentInput),
      role: editForm.role,
      can_create_workspaces: editForm.can_create_workspaces ?? false,
      needs_setup: false, // saving the profile completes setup
    }).eq('id', selected.id).select()

    if (error) {
      setSaveError(`Save failed: ${error.message}`)
      setSaving(false)
      return
    }
    if (!updated || updated.length === 0) {
      setSaveError(
        'Save had no effect — your account may not have permission to edit other profiles. ' +
        'Make sure the "Supervisors and admins can update profiles" policy has been applied ' +
        '(supabase/migration_admin_update_profiles.sql).'
      )
      setSaving(false)
      return
    }

    if (supervisorId) {
      const { error: supErr } = await supabase.from('supervisor_assignments').upsert({
        staff_id: selected.id,
        supervisor_id: supervisorId,
        is_primary: true,
      }, { onConflict: 'staff_id,supervisor_id' })
      if (supErr) {
        setSaveError(`Profile saved, but supervisor assignment failed: ${supErr.message}`)
        setSaving(false)
        return
      }
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First Name</label>
                  <input className="input" value={editForm.first_name ?? ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input className="input" value={editForm.last_name ?? ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Email (login)</label>
                <input
                  type="email"
                  className="input"
                  value={editForm.email ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Changing this changes how they sign in. Must be an @gcschool.org address.
                </p>
              </div>
              <div>
                <label className="label">Title</label>
                <input className="input" value={editForm.title ?? ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div>
                <label className="label">Division</label>
                <select className="input" value={editForm.division ?? ''} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}>
                  <option value="">Unspecified</option>
                  {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={editForm.department ?? ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}>
                  <option value="">Unspecified</option>
                  {DEPARTMENT_GROUPS.map((g) => (
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
                <label className="label">Employee ID</label>
                <input
                  className="input"
                  placeholder="e.g. 4160"
                  value={editForm.employee_id ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Matches the employee_id column in the roster CSV.
                </p>
              </div>
              <div>
                <label className="label">Employee Type</label>
                <select className="input" value={editForm.employee_type ?? ''} onChange={(e) => setEditForm({ ...editForm, employee_type: e.target.value })}>
                  <option value="">Unspecified</option>
                  <option value="faculty">Faculty</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin (Administration)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Drives which fund-year reset applies (staff &amp; admin July 1, faculty late Aug).
                </p>
              </div>
              <div>
                <label className="label">PD allotment override ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder="School default"
                  value={allotmentInput}
                  onChange={(e) => setAllotmentInput(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Leave blank to use the school default.
                </p>
              </div>
              {isAdmin && (
                <div>
                  <label className="label">Access</label>
                  <select className="input" value={editForm.role ?? 'staff'} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Profile['role'] })}>
                    <option value="staff">Member</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Platform Admin</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  id="can-create-workspaces"
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-navy-500"
                  checked={editForm.can_create_workspaces ?? false}
                  onChange={(e) => setEditForm({ ...editForm, can_create_workspaces: e.target.checked })}
                />
                <label htmlFor="can-create-workspaces" className="text-sm text-gray-700">
                  Can create workspaces
                  <span className="text-gray-400"> (e.g. department heads)</span>
                </label>
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

            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {saveError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-a-person drawer */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-900">Add a person</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            </div>

            <p className="text-sm text-gray-500">
              Creates the login and profile immediately — the same result as a
              one-row CSV import. They sign in with Google using this address.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First Name *</label>
                  <input className="input" value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input className="input" value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Email (login) *</label>
                <input type="email" className="input" placeholder="name@gcschool.org" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Must be an @gcschool.org address.</p>
              </div>
              <div>
                <label className="label">Title</label>
                <input className="input" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Division</label>
                  <select className="input" value={createForm.division} onChange={(e) => setCreateForm({ ...createForm, division: e.target.value })}>
                    <option value="">Unspecified</option>
                    {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select className="input" value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}>
                    <option value="">Unspecified</option>
                    {DEPARTMENT_GROUPS.map((g) => (
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Employee ID</label>
                  <input className="input" placeholder="e.g. 4160" value={createForm.employee_id} onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })} />
                </div>
                <div>
                  <label className="label">Employee Type</label>
                  <select className="input" value={createForm.employee_type} onChange={(e) => setCreateForm({ ...createForm, employee_type: e.target.value })}>
                    <option value="">Unspecified</option>
                    <option value="faculty">Faculty</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin (Administration)</option>
                  </select>
                </div>
              </div>
              {isAdmin && (
                <div>
                  <label className="label">Access</label>
                  <select className="input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                    <option value="staff">Member</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Platform Admin</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Only admins can grant Supervisor or Platform Admin access.
                  </p>
                </div>
              )}
              <div>
                <label className="label">PD allotment override ($)</label>
                <input type="number" step="0.01" min="0" className="input" placeholder="School default" value={createForm.pd_allotment} onChange={(e) => setCreateForm({ ...createForm, pd_allotment: e.target.value })} />
              </div>
              <div>
                <label className="label">Primary Supervisor</label>
                <select className="input" value={createForm.supervisor_id} onChange={(e) => setCreateForm({ ...createForm, supervisor_id: e.target.value })}>
                  <option value="">None for now</option>
                  {allProfiles.filter((p) => p.role === 'supervisor' || p.role === 'admin').map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Needed before they can submit funding requests for approval.
                </p>
              </div>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {createError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1">
                {creating ? 'Creating…' : 'Create Person'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters + export */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, title, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1"
          />
          <select className="input sm:w-44" value={divFilter} onChange={(e) => setDivFilter(e.target.value)}>
            <option value="">All Divisions</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input sm:w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            className="input sm:w-44"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as '' | 'staff' | 'supervisor' | 'admin')}
          >
            <option value="">All Access</option>
            <option value="staff">Member</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Platform Admin</option>
          </select>
          <select className="input sm:w-64" value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
            <option value="">Any Supervisor</option>
            {supervisorOptions.map((p) => (
              <option key={p.id} value={p.email}>
                Reports to {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          {(divFilter || deptFilter || roleFilter || supFilter || typeFilter || needsSetupOnly || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch(''); setDivFilter(''); setDeptFilter(''); setRoleFilter('')
                setSupFilter(''); setTypeFilter(''); setNeedsSetupOnly(false)
              }}
              className="text-sm text-navy-800 font-medium hover:underline self-center whitespace-nowrap"
            >
              Clear all filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Employee-type filter (faculty / staff / admin) */}
          {([['', 'All'], ['faculty', 'Faculty'], ['staff', 'Staff'], ['admin', 'Admin']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={clsx('tab', typeFilter === val ? 'tab-active' : 'tab-inactive')}
            >
              {label}
            </button>
          ))}

          {staff.some((s) => s.needs_setup) && (
            <button
              onClick={() => setNeedsSetupOnly(!needsSetupOnly)}
              className={clsx(
                'tab flex items-center gap-1.5',
                needsSetupOnly ? 'tab-active' : 'tab-inactive'
              )}
            >
              Needs setup
              <span className={clsx(
                'text-xs font-bold rounded-full px-1.5',
                needsSetupOnly ? 'bg-white/20 text-white' : 'bg-yellow-100 text-yellow-700'
              )}>
                {staff.filter((s) => s.needs_setup).length}
              </span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{filtered.length} shown</span>
            <button
              onClick={() => { setCreateForm({ ...emptyCreateForm }); setCreateError(null); setShowCreate(true) }}
              className="btn-primary text-sm"
            >
              + Add Person
            </button>
            <button onClick={exportCsv} className="btn-secondary text-sm">Export CSV</button>
            <button onClick={exportXlsx} className="btn-secondary text-sm">Export XLSX</button>
          </div>
        </div>
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
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Access</th>
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
                      {s.needs_setup && (
                        <span className="badge badge-yellow text-[10px]">Needs setup</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{s.title ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{s.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">{s.supervisors}</td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-800">{s.pdHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${
                      s.role === 'admin' ? 'badge-red' : s.role === 'supervisor' ? 'badge-navy' : 'badge-gray'
                    }`}>
                      {roleAccessLabel(s.role)}
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
