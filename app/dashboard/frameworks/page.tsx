'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Framework, FrameworkDomain, FrameworkIndicator } from '@/lib/types'
import { PD_ROLES, LEADERSHIP_ROLES } from '@/lib/roles'
import {
  TRACKS, TRACK_LABELS, targetSummary, targetMatchesPerson, trackForProfile,
  studentSupportDepartments, type Track,
} from '@/lib/tracks'
import { settingsMap } from '@/lib/appSettings'
import clsx from 'clsx'

// Chip-toggle for the track / role targeting pickers.
function TargetChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
        on ? 'bg-navy-900 text-white border-navy-900' : 'border-gray-300 text-gray-600 hover:border-navy-400'
      )}
    >
      {label}
    </button>
  )
}

// The two targeting pickers (tracks + roles) shared by the create & edit forms.
function TargetingFields({
  tracks, roles, onTracks, onRoles,
}: {
  tracks: string[]; roles: string[]
  onTracks: (next: string[]) => void; onRoles: (next: string[]) => void
}) {
  const leadersOn = LEADERSHIP_ROLES.every((r) => roles.includes(r))
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-800">Applies to</p>
        <p className="text-xs text-gray-400">
          Who this framework is shown to. Leave both blank for <strong>everyone</strong>.
          Current: <span className="text-gray-600">{targetSummary(tracks, roles, LEADERSHIP_ROLES)}</span>
        </p>
      </div>
      <div>
        <p className="label">Tracks</p>
        <div className="flex flex-wrap gap-1.5">
          {TRACKS.map((t) => {
            const on = tracks.includes(t)
            return <TargetChip key={t} on={on} label={TRACK_LABELS[t]} onClick={() => onTracks(on ? tracks.filter((x) => x !== t) : [...tracks, t])} />
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <p className="label mb-0">Roles</p>
          <button type="button" onClick={() => onRoles(leadersOn ? [] : [...LEADERSHIP_ROLES])} className="text-xs text-navy-700 hover:underline">
            {leadersOn ? 'Clear leaders' : 'Leaders only'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PD_ROLES.map((r) => {
            const on = roles.includes(r)
            return <TargetChip key={r} on={on} label={r} onClick={() => onRoles(on ? roles.filter((x) => x !== r) : [...roles, r])} />
          })}
        </div>
      </div>
    </div>
  )
}

function FrameworkDetail({ fw }: { fw: Framework }) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {fw.description && (
        <p className="text-sm text-gray-600 mb-4">{fw.description}</p>
      )}
      {(fw.domains ?? []).map((domain) => (
        <div key={domain.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggle(domain.id)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-900">{domain.title}</p>
              {domain.description && (
                <p className="text-xs text-gray-500 mt-0.5">{domain.description}</p>
              )}
            </div>
            <span className="text-gray-400 shrink-0 ml-2">{open.has(domain.id) ? '▲' : '▼'}</span>
          </button>
          {open.has(domain.id) && (domain.indicators ?? []).length > 0 && (
            <ul className="border-t border-gray-100 divide-y divide-gray-100">
              {(domain.indicators ?? []).map((ind: FrameworkIndicator) => (
                <li key={ind.id} className="px-6 py-3">
                  <p className="text-sm font-medium text-gray-800">{ind.title}</p>
                  {ind.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{ind.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

interface DomainInput {
  title: string
  description: string
  indicators: { title: string; description: string }[]
}

// Edit-mode domain/indicator rows carry the existing row id (when present) so a
// save can update it in place, insert new ones, and delete removed ones —
// instead of wiping and re-creating (which would cascade-delete observation
// ratings tied to those domains).
interface EditIndicator { id?: string; title: string; description: string }
interface EditDomain { id?: string; title: string; description: string; indicators: EditIndicator[] }

export default function FrameworksPage() {
  const supabase = createClient()
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [selected, setSelected] = useState<Framework | null>(null)
  const [userRole, setUserRole] = useState<string>('staff')
  const [viewerTrack, setViewerTrack] = useState<Track>('institutional')
  const [viewerRoles, setViewerRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Detail-view management (edit header fields / delete)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<{ title: string; division: string; department: string; description: string; target_tracks: string[]; target_roles: string[] }>({ title: '', division: '', department: '', description: '', target_tracks: [], target_roles: [] })
  const [usageCount, setUsageCount] = useState<number | null>(null)
  const [editDomains, setEditDomains] = useState<EditDomain[]>([])
  const [managing, setManaging] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)

  // Form state
  const [fwForm, setFwForm] = useState<{ title: string; division: string; department: string; description: string; target_tracks: string[]; target_roles: string[] }>({ title: '', division: '', department: '', description: '', target_tracks: [], target_roles: [] })
  const [domains, setDomains] = useState<DomainInput[]>([
    { title: '', description: '', indicators: [{ title: '', description: '' }] },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const [{ data: p }, { data: settingsRows }] = await Promise.all([
        supabase.from('profiles').select('role, department, employee_type, teaches_classes, track, roles').eq('id', user.id).single(),
        supabase.from('app_settings').select('key, value'),
      ])
      setUserRole(p?.role ?? 'staff')
      setViewerRoles(((p as { roles?: string[] } | null)?.roles) ?? [])
      setViewerTrack(trackForProfile(
        (p ?? {}) as { track?: string | null; employee_type?: string | null; teaches_classes?: boolean | null; department?: string | null },
        studentSupportDepartments(settingsMap(settingsRows))
      ))
    }
    const { data: fws } = await supabase
      .from('frameworks')
      .select('*, domains:framework_domains(*, indicators:framework_indicators(*))')
      .order('title')
    setFrameworks((fws ?? []) as unknown as Framework[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // When a framework detail opens, seed the edit form and count its usage.
  useEffect(() => {
    if (!selected) { setUsageCount(null); return }
    setEditing(false)
    setManageError(null)
    setEditForm({
      title: selected.title,
      division: selected.division ?? '',
      department: selected.department ?? '',
      description: selected.description ?? '',
      target_tracks: selected.target_tracks ?? [],
      target_roles: selected.target_roles ?? [],
    })
    setEditDomains((selected.domains ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description ?? '',
      indicators: (d.indicators ?? []).map((ind) => ({ id: ind.id, title: ind.title, description: ind.description ?? '' })),
    })))
    supabase
      .from('observations')
      .select('id', { count: 'exact', head: true })
      .eq('framework_id', selected.id)
      .then(({ count }) => setUsageCount(count ?? 0))
  }, [selected])

  const handleSaveHeader = async () => {
    if (!selected) return

    // Domains being removed cascade-delete any observation ratings against them.
    const keptDomainIds = new Set(editDomains.filter((d) => d.id).map((d) => d.id as string))
    const removedDomains = (selected.domains ?? []).filter((d) => !keptDomainIds.has(d.id))
    if (removedDomains.length > 0 && !window.confirm(
      `You're removing ${removedDomains.length} domain${removedDomains.length === 1 ? '' : 's'}. Any observation ratings recorded against ${removedDomains.length === 1 ? 'it' : 'them'} will also be deleted. Continue?`
    )) return

    setManaging(true)
    setManageError(null)
    const fail = (msg: string) => { setManageError(msg); setManaging(false) }

    // 1. Header + targeting.
    const { error: hErr } = await supabase
      .from('frameworks')
      .update({
        title: editForm.title.trim() || selected.title,
        division: editForm.division.trim() || null,
        department: editForm.department.trim() || null,
        description: editForm.description.trim() || null,
        target_tracks: editForm.target_tracks,
        target_roles: editForm.target_roles,
      })
      .eq('id', selected.id)
      .select('id')
    if (hErr) return fail(`Save failed: ${hErr.message}`)

    // 2. Delete removed domains (cascade removes their indicators + ratings).
    for (const d of removedDomains) {
      const { error } = await supabase.from('framework_domains').delete().eq('id', d.id).select('id')
      if (error) return fail(`Removing “${d.title}” failed: ${error.message}`)
    }

    // 3. Upsert each kept/new domain and reconcile its indicators.
    for (let i = 0; i < editDomains.length; i++) {
      const d = editDomains[i]
      if (!d.title.trim()) continue
      let domainId = d.id
      if (domainId) {
        const { error } = await supabase.from('framework_domains')
          .update({ title: d.title.trim(), description: d.description.trim() || null, order_index: i })
          .eq('id', domainId).select('id')
        if (error) return fail(`Saving “${d.title}” failed: ${error.message}`)
      } else {
        const { data, error } = await supabase.from('framework_domains')
          .insert({ framework_id: selected.id, title: d.title.trim(), description: d.description.trim() || null, order_index: i })
          .select('id').single()
        if (error || !data) return fail(`Adding “${d.title}” failed: ${error?.message ?? 'no row returned'}`)
        domainId = data.id
      }

      const origIndicators = (selected.domains ?? []).find((x) => x.id === domainId)?.indicators ?? []
      const keptIndIds = new Set(d.indicators.filter((ind) => ind.id).map((ind) => ind.id as string))
      for (const ind of origIndicators.filter((ind) => !keptIndIds.has(ind.id))) {
        const { error } = await supabase.from('framework_indicators').delete().eq('id', ind.id).select('id')
        if (error) return fail(`Removing an indicator failed: ${error.message}`)
      }
      for (let j = 0; j < d.indicators.length; j++) {
        const ind = d.indicators[j]
        if (!ind.title.trim()) continue
        if (ind.id) {
          const { error } = await supabase.from('framework_indicators')
            .update({ title: ind.title.trim(), description: ind.description.trim() || null, order_index: j })
            .eq('id', ind.id).select('id')
          if (error) return fail(`Saving an indicator failed: ${error.message}`)
        } else {
          const { error } = await supabase.from('framework_indicators')
            .insert({ domain_id: domainId, title: ind.title.trim(), description: ind.description.trim() || null, order_index: j }).select('id')
          if (error) return fail(`Adding an indicator failed: ${error.message}`)
        }
      }
    }

    // 4. Refetch the framework with its reconciled domains/indicators.
    const { data: fresh, error: reErr } = await supabase
      .from('frameworks')
      .select('*, domains:framework_domains(*, indicators:framework_indicators(*))')
      .eq('id', selected.id).single()
    setManaging(false)
    if (reErr) { setManageError(`Saved, but reloading failed: ${reErr.message}`); return }
    setSelected(fresh as unknown as Framework)
    setEditing(false)
    load()
  }

  // ── Edit-mode domain/indicator manipulation ──────────────────────────
  const edAddDomain = () => setEditDomains((ds) => [...ds, { title: '', description: '', indicators: [] }])
  const edRemoveDomain = (i: number) => setEditDomains((ds) => ds.filter((_, idx) => idx !== i))
  const edUpdateDomain = (i: number, key: 'title' | 'description', val: string) =>
    setEditDomains((ds) => ds.map((d, idx) => (idx === i ? { ...d, [key]: val } : d)))
  const edAddIndicator = (di: number) =>
    setEditDomains((ds) => ds.map((d, idx) => (idx === di ? { ...d, indicators: [...d.indicators, { title: '', description: '' }] } : d)))
  const edRemoveIndicator = (di: number, ii: number) =>
    setEditDomains((ds) => ds.map((d, idx) => (idx === di ? { ...d, indicators: d.indicators.filter((_, j) => j !== ii) } : d)))
  const edUpdateIndicator = (di: number, ii: number, key: 'title' | 'description', val: string) =>
    setEditDomains((ds) => ds.map((d, idx) => (idx === di
      ? { ...d, indicators: d.indicators.map((ind, j) => (j === ii ? { ...ind, [key]: val } : ind)) }
      : d)))

  const handleDelete = async () => {
    if (!selected) return
    const used = usageCount && usageCount > 0
    const msg = used
      ? `Delete “${selected.title}”? ${usageCount} observation${usageCount === 1 ? '' : 's'} use it — those are kept but unlinked from this framework. Its domains and indicators are permanently removed. This cannot be undone.`
      : `Delete “${selected.title}”? Its domains and indicators are permanently removed. This cannot be undone.`
    if (!window.confirm(msg)) return
    setManaging(true)
    setManageError(null)
    const { error } = await supabase.from('frameworks').delete().eq('id', selected.id)
    setManaging(false)
    if (error) { setManageError(`Delete failed: ${error.message}`); return }
    setSelected(null)
    load()
  }

  const addDomain = () =>
    setDomains((prev) => [...prev, { title: '', description: '', indicators: [{ title: '', description: '' }] }])

  const removeDomain = (i: number) =>
    setDomains((prev) => prev.filter((_, idx) => idx !== i))

  const updateDomain = (i: number, key: 'title' | 'description', val: string) =>
    setDomains((prev) => prev.map((d, idx) => (idx === i ? { ...d, [key]: val } : d)))

  const addIndicator = (domainIdx: number) =>
    setDomains((prev) =>
      prev.map((d, i) =>
        i === domainIdx
          ? { ...d, indicators: [...d.indicators, { title: '', description: '' }] }
          : d
      )
    )

  const updateIndicator = (
    domainIdx: number,
    indIdx: number,
    key: 'title' | 'description',
    val: string
  ) =>
    setDomains((prev) =>
      prev.map((d, di) =>
        di === domainIdx
          ? {
              ...d,
              indicators: d.indicators.map((ind, ii) =>
                ii === indIdx ? { ...ind, [key]: val } : ind
              ),
            }
          : d
      )
    )

  const removeIndicator = (domainIdx: number, indIdx: number) =>
    setDomains((prev) =>
      prev.map((d, di) =>
        di === domainIdx
          ? { ...d, indicators: d.indicators.filter((_, ii) => ii !== indIdx) }
          : d
      )
    )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: fw, error: fwErr } = await supabase
        .from('frameworks')
        .insert({
          title: fwForm.title,
          division: fwForm.division || null,
          department: fwForm.department || null,
          description: fwForm.description || null,
          target_tracks: fwForm.target_tracks,
          target_roles: fwForm.target_roles,
          created_by: user.id,
        })
        .select()
        .single()
      if (fwErr) throw fwErr

      for (let di = 0; di < domains.length; di++) {
        const dom = domains[di]
        if (!dom.title.trim()) continue
        const { data: domRow, error: domErr } = await supabase
          .from('framework_domains')
          .insert({
            framework_id: fw.id,
            title: dom.title,
            description: dom.description || null,
            order_index: di,
          })
          .select()
          .single()
        if (domErr) throw domErr

        const indicators = dom.indicators.filter((ind) => ind.title.trim())
        if (indicators.length > 0) {
          await supabase.from('framework_indicators').insert(
            indicators.map((ind, ii) => ({
              domain_id: domRow.id,
              title: ind.title,
              description: ind.description || null,
              order_index: ii,
            }))
          )
        }
      }

      setShowCreate(false)
      setFwForm({ title: '', division: '', department: '', description: '', target_tracks: [], target_roles: [] })
      setDomains([{ title: '', description: '', indicators: [{ title: '', description: '' }] }])
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create framework')
    } finally {
      setSubmitting(false)
    }
  }

  const isSupervisorOrAdmin = userRole === 'supervisor' || userRole === 'admin'

  // Members see only frameworks that apply to their track + role; supervisors
  // and admins see all (they observe others and manage the rubrics).
  const visibleFrameworks = isSupervisorOrAdmin
    ? frameworks
    : frameworks.filter((fw) => targetMatchesPerson(fw.target_tracks, fw.target_roles, viewerTrack, viewerRoles))

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="btn-ghost text-sm"
        >
          ← Back to Frameworks
        </button>
        <div className="card p-6">
          {editing ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 text-lg">Edit framework</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Title</label>
                  <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </div>
                <div>
                  <label className="label">Division</label>
                  <input className="input" value={editForm.division} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })} />
                </div>
                <div>
                  <label className="label">Department</label>
                  <input className="input" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea rows={2} className="input resize-none" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                </div>
              </div>
              <TargetingFields
                tracks={editForm.target_tracks} roles={editForm.target_roles}
                onTracks={(t) => setEditForm({ ...editForm, target_tracks: t })}
                onRoles={(r) => setEditForm({ ...editForm, target_roles: r })}
              />
              {/* Inline domain & indicator editor */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800">Domains</h4>
                  <button type="button" onClick={edAddDomain} className="btn-ghost text-sm">+ Add Domain</button>
                </div>
                {editDomains.length === 0 && <p className="text-sm text-gray-400">No domains yet — add one.</p>}
                {editDomains.map((dom, di) => (
                  <div key={dom.id ?? `new-${di}`} className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">DOMAIN {di + 1}</span>
                      <button type="button" onClick={() => edRemoveDomain(di)} className="ml-auto text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                    <input className="input text-sm" placeholder="Domain title (required)" value={dom.title} onChange={(e) => edUpdateDomain(di, 'title', e.target.value)} />
                    <input className="input text-sm" placeholder="Domain description (optional)" value={dom.description} onChange={(e) => edUpdateDomain(di, 'description', e.target.value)} />
                    <div className="pl-3 border-l-2 border-gray-200 space-y-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Indicators</p>
                      {dom.indicators.map((ind, ii) => (
                        <div key={ind.id ?? `new-${ii}`} className="flex gap-2 items-start">
                          <div className="flex-1 space-y-1">
                            <input className="input text-sm" placeholder="Indicator title" value={ind.title} onChange={(e) => edUpdateIndicator(di, ii, 'title', e.target.value)} />
                            <input className="input text-sm" placeholder="Indicator description (optional)" value={ind.description} onChange={(e) => edUpdateIndicator(di, ii, 'description', e.target.value)} />
                          </div>
                          <button type="button" onClick={() => edRemoveIndicator(di, ii)} className="text-gray-400 hover:text-red-500 mt-1 text-lg leading-none">×</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => edAddIndicator(di)} className="text-xs text-navy-700 hover:underline">+ Add Indicator</button>
                    </div>
                  </div>
                ))}
              </div>
              {manageError && <p className="text-red-600 text-sm">{manageError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSaveHeader} disabled={managing} className="btn-primary flex-1">{managing ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.title}</h2>
                  {(selected.division || selected.department) && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {[selected.division, selected.department].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="badge badge-navy">{(selected.domains ?? []).length} domains</span>
                  {((selected.target_tracks ?? []).length > 0 || (selected.target_roles ?? []).length > 0) && (
                    <span className="badge badge-yellow text-[10px]">{targetSummary(selected.target_tracks, selected.target_roles, LEADERSHIP_ROLES)}</span>
                  )}
                </div>
              </div>
              <FrameworkDetail fw={selected} />
              {isSupervisorOrAdmin && (
                <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100">
                  <button onClick={() => setEditing(true)} className="btn-secondary text-sm">Edit</button>
                  {userRole === 'admin' && (
                    <button onClick={handleDelete} disabled={managing} className="text-sm text-red-600 hover:text-red-800 font-medium">
                      {managing ? 'Deleting…' : 'Delete framework'}
                    </button>
                  )}
                  {usageCount != null && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {usageCount} observation{usageCount === 1 ? '' : 's'} use this
                    </span>
                  )}
                </div>
              )}
              {manageError && <p className="text-red-600 text-sm mt-3">{manageError}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {isSupervisorOrAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            + Create Framework
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="card p-6 space-y-5">
          <h3 className="font-semibold text-gray-900 text-lg">New Framework</h3>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input required className="input" value={fwForm.title}
                  onChange={(e) => setFwForm({ ...fwForm, title: e.target.value })}
                  placeholder="e.g. GCS Teaching Excellence Framework" />
              </div>
              <div>
                <label className="label">Division</label>
                <input className="input" value={fwForm.division}
                  onChange={(e) => setFwForm({ ...fwForm, division: e.target.value })}
                  placeholder="High School" />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={fwForm.department}
                  onChange={(e) => setFwForm({ ...fwForm, department: e.target.value })}
                  placeholder="All Departments" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea rows={2} className="input resize-none" value={fwForm.description}
                  onChange={(e) => setFwForm({ ...fwForm, description: e.target.value })}
                  placeholder="Purpose and scope of this framework" />
              </div>
            </div>

            <TargetingFields
              tracks={fwForm.target_tracks} roles={fwForm.target_roles}
              onTracks={(t) => setFwForm({ ...fwForm, target_tracks: t })}
              onRoles={(r) => setFwForm({ ...fwForm, target_roles: r })}
            />

            {/* Domains */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-800">Domains</h4>
                <button type="button" onClick={addDomain} className="btn-ghost text-sm">
                  + Add Domain
                </button>
              </div>
              {domains.map((dom, di) => (
                <div key={di} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">DOMAIN {di + 1}</span>
                    {domains.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDomain(di)}
                        className="ml-auto text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    className="input text-sm"
                    placeholder="Domain title (required)"
                    value={dom.title}
                    onChange={(e) => updateDomain(di, 'title', e.target.value)}
                  />
                  <input
                    className="input text-sm"
                    placeholder="Domain description (optional)"
                    value={dom.description}
                    onChange={(e) => updateDomain(di, 'description', e.target.value)}
                  />
                  {/* Indicators */}
                  <div className="pl-3 border-l-2 border-gray-200 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Indicators</p>
                    {dom.indicators.map((ind, ii) => (
                      <div key={ii} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <input
                            className="input text-sm"
                            placeholder="Indicator title"
                            value={ind.title}
                            onChange={(e) => updateIndicator(di, ii, 'title', e.target.value)}
                          />
                          <input
                            className="input text-sm"
                            placeholder="Indicator description (optional)"
                            value={ind.description}
                            onChange={(e) => updateIndicator(di, ii, 'description', e.target.value)}
                          />
                        </div>
                        {dom.indicators.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeIndicator(di, ii)}
                            className="text-gray-400 hover:text-red-500 mt-1 text-lg leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addIndicator(di)}
                      className="text-xs text-navy-700 hover:underline"
                    >
                      + Add Indicator
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Creating…' : 'Create Framework'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card h-32 animate-pulse bg-gray-100" />)}
        </div>
      ) : visibleFrameworks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {frameworks.length === 0 ? 'No frameworks yet.' : 'No frameworks apply to your track yet.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleFrameworks.map((fw) => (
            <button
              key={fw.id}
              onClick={() => setSelected(fw)}
              className="card p-5 text-left hover:shadow-md transition-shadow group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-navy-800 transition-colors">
                {fw.title}
              </h3>
              {(fw.division || fw.department) && (
                <p className="text-xs text-gray-500 mt-1">
                  {[fw.division, fw.department].filter(Boolean).join(' · ')}
                </p>
              )}
              {fw.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{fw.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="badge badge-gray">
                  {(fw.domains ?? []).length} domain{(fw.domains ?? []).length !== 1 ? 's' : ''}
                </span>
                {((fw.target_tracks ?? []).length > 0 || (fw.target_roles ?? []).length > 0) && (
                  <span className="badge badge-yellow text-[10px]">{targetSummary(fw.target_tracks, fw.target_roles, LEADERSHIP_ROLES)}</span>
                )}
              </div>
              <p className="text-xs text-navy-700 mt-2 group-hover:underline">View details →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
