'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, ProjectStatus, Profile } from '@/lib/types'
import { useTabParam } from '@/lib/useTabParam'
import PersonPicker from '@/components/PersonPicker'
import { settingsMap } from '@/lib/appSettings'
import { trackForProfile, studentSupportDepartments, trackIsConfidential } from '@/lib/tracks'
import clsx from 'clsx'

const PROJECT_TABS = ['mine', 'collab', 'team', 'archived'] as const
type TabId = (typeof PROJECT_TABS)[number]

const statusColor: Record<ProjectStatus, string> = {
  planning: 'badge-gray',
  active: 'badge-green',
  on_hold: 'badge-yellow',
  complete: 'badge-navy',
  archived: 'badge-gray',
}
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', complete: 'Complete', archived: 'Archived',
}
const EDITABLE_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'complete']

function currentSchoolYear(): number {
  const d = new Date()
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className="bg-navy-700 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function ProjectCard({
  project, currentUserId, showOwner, onArchive, onRestore, onDelete,
}: {
  project: Project
  currentUserId: string | null
  showOwner?: boolean
  onArchive?: (id: string) => void
  onRestore?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const canManage = !!currentUserId && project.owner_id === currentUserId

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/dashboard/projects/${project.id}`} className="font-semibold text-gray-900 leading-snug hover:text-navy-800 min-w-0">
          {project.title}
        </Link>
        <div className="flex items-start gap-1 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span className={clsx('badge', statusColor[project.status])}>{STATUS_LABEL[project.status]}</span>
            {project.visibility === 'private' && (
              <span className="badge badge-gray" title="Private — visible only to you, your supervisor, and admins">🔒 Private</span>
            )}
          </div>
          {canManage && (
            <div className="relative">
              <button onClick={() => setShowMenu((s) => !s)} className="text-gray-400 hover:text-gray-700 p-1 -mr-1 rounded" aria-label="Project actions">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
              </button>
              {showMenu && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                    {project.status === 'archived' ? (
                      <button onClick={() => { setShowMenu(false); onRestore?.(project.id) }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Restore</button>
                    ) : (
                      <button onClick={() => { setShowMenu(false); onArchive?.(project.id) }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Archive</button>
                    )}
                    <button
                      onClick={() => { setShowMenu(false); if (window.confirm('Delete this project permanently? This cannot be undone.')) onDelete?.(project.id) }}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showOwner && project.owner && (
        <p className="text-xs text-gray-400 -mt-1">{project.owner.first_name} {project.owner.last_name}</p>
      )}
      {project.description && <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>}

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Progress</span><span>{project.progress_pct}%</span></div>
        <ProgressBar pct={project.progress_pct} />
      </div>

      {project.target_date && <p className="text-xs text-gray-400">Target {fmtDate(project.target_date)}</p>}

      {project.collaborators && project.collaborators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.collaborators.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 bg-navy-50 text-navy-800 border border-navy-100 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium">
              <span className="w-4 h-4 rounded-full bg-navy-200 text-navy-900 text-[9px] font-bold flex items-center justify-center">{(c.first_name?.[0] ?? '')}{(c.last_name?.[0] ?? '')}</span>
              {c.first_name} {c.last_name}
            </span>
          ))}
        </div>
      )}

      <div className="pt-1">
        <Link href={`/dashboard/projects/${project.id}`} className="btn-secondary text-xs">Open project →</Link>
      </div>
    </div>
  )
}

function ProjectForm({
  onSave, onCancel, profiles, currentUserId, defaultYear, defaultPrivate = false,
}: {
  onSave: (data: Partial<Project>, collaborators: Profile[]) => Promise<void>
  onCancel: () => void
  profiles: Profile[]
  currentUserId: string | null
  defaultYear: number
  defaultPrivate?: boolean
}) {
  const [form, setForm] = useState({
    title: '', description: '', status: 'planning' as ProjectStatus,
    school_year_start: defaultYear, start_date: '', target_date: '',
    visibility: (defaultPrivate ? 'private' : 'normal') as 'normal' | 'private',
  })
  const [collaborators, setCollaborators] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const years = Array.from({ length: 3 }, (_, i) => currentSchoolYear() + 1 - i)

  // defaultPrivate can resolve after this form has mounted (e.g. the ?new=1
  // deep-link races the profile/track load), so sync the checkbox when it
  // arrives — but stop once the user has set it themselves.
  const vizTouched = useRef(false)
  useEffect(() => {
    if (!vizTouched.current) {
      setForm((f) => ({ ...f, visibility: defaultPrivate ? 'private' : 'normal' }))
    }
  }, [defaultPrivate])

  const save = async () => {
    setSaving(true)
    await onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      school_year_start: form.school_year_start,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      visibility: form.visibility,
    }, collaborators)
    setSaving(false)
  }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">New Project</h3>
      <div>
        <label className="label">Title <span className="text-red-500">*</span></label>
        <input className="input" placeholder="e.g. Fall giving campaign, new intake workflow…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea rows={3} className="input resize-none" placeholder="What is this initiative and what does done look like?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">School year</label>
          <select className="input" value={form.school_year_start} onChange={(e) => setForm({ ...form, school_year_start: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Start date</label>
          <input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <label className="label">Target date</label>
          <input type="date" className="input" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Collaborators</label>
        <PersonPicker multiple profiles={profiles} exclude={currentUserId ? [currentUserId] : []} value={collaborators} onChange={setCollaborators} placeholder="Search colleagues by name…" />
      </div>
      <div className="flex items-center gap-2">
        <input id="proj-private" type="checkbox" className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-navy-500"
          checked={form.visibility === 'private'} onChange={(e) => { vizTouched.current = true; setForm({ ...form, visibility: e.target.checked ? 'private' : 'normal' }) }} />
        <label htmlFor="proj-private" className="text-sm text-gray-700">
          Private <span className="text-gray-400">— visible only to me, my supervisor, and admins (for confidential/student-facing work)</span>
        </label>
      </div>
      {defaultPrivate && (
        <p className="text-xs text-navy-700 -mt-2">
          Defaulted to private because you&apos;re on the Student Support track. Uncheck if this project isn&apos;t confidential.
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary flex-1">{saving ? 'Saving…' : 'Create Project'}</button>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const supabase = createClient()
  const [tab, setTab] = useTabParam<TabId>(PROJECT_TABS, 'mine')
  const [mine, setMine] = useState<Project[]>([])
  const [collab, setCollab] = useState<Project[]>([])
  const [team, setTeam] = useState<Project[]>([])
  const [archived, setArchived] = useState<Project[]>([])
  const [supervisees, setSupervisees] = useState<Profile[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [defaultPrivate, setDefaultPrivate] = useState(false)
  const [newYear, setNewYear] = useState(currentSchoolYear())
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: myRows }, { data: collabRows }, { data: archRows }, { data: allProfiles }, { data: assigns }, { data: settingsRows }] = await Promise.all([
      supabase.from('projects').select('*').eq('owner_id', user.id).in('status', EDITABLE_STATUSES).order('created_at', { ascending: false }),
      supabase.from('project_collaborators').select('projects(*)').eq('user_id', user.id),
      supabase.from('projects').select('*').eq('owner_id', user.id).eq('status', 'archived').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('first_name'),
      supabase.from('supervisor_assignments').select('staff_id').eq('supervisor_id', user.id),
      supabase.from('app_settings').select('key, value'),
    ])

    const profById = new Map((allProfiles ?? []).map((p) => [p.id, p as Profile]))

    // Student Support staff get confidential-by-default projects.
    const me = profById.get(user.id)
    if (me) {
      const track = trackForProfile(me, studentSupportDepartments(settingsMap(settingsRows)))
      setDefaultPrivate(trackIsConfidential(track))
    }
    const mineRows = (myRows ?? []) as Project[]
    const collaborative = (collabRows ?? []).flatMap((c) => (c.projects ? [c.projects as unknown as Project] : []))
    const arch = (archRows ?? []) as Project[]

    const superviseeIds = Array.from(new Set((assigns ?? []).map((a) => a.staff_id as string).filter((id) => id !== user.id)))
    const superviseeProfiles = superviseeIds.map((id) => profById.get(id)).filter((p): p is Profile => Boolean(p))
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
    setSupervisees(superviseeProfiles)

    const { data: teamRows } = superviseeIds.length > 0
      ? await supabase.from('projects').select('*').in('owner_id', superviseeIds).in('status', EDITABLE_STATUSES).order('created_at', { ascending: false })
      : { data: [] as Project[] }
    const teamProjects = (teamRows ?? []) as Project[]

    // Batched collaborator hydration for all visible projects.
    const allIds = Array.from(new Set([...mineRows, ...collaborative, ...arch, ...teamProjects].map((p) => p.id)))
    const collabMap: Record<string, Profile[]> = {}
    if (allIds.length > 0) {
      const { data: rows } = await supabase.from('project_collaborators')
        .select('project_id, profile:profiles(id, first_name, last_name, title)').in('project_id', allIds)
      for (const row of rows ?? []) {
        const p = row.profile as unknown as Profile | null
        if (!p) continue
        collabMap[row.project_id] = [...(collabMap[row.project_id] ?? []), p]
      }
    }
    const attach = (p: Project): Project => ({ ...p, collaborators: collabMap[p.id] ?? [], owner: profById.get(p.owner_id) })

    setMine(mineRows.map(attach))
    const sharedIds = new Set(collaborative.map((p) => p.id))
    const ownedShared = mineRows.filter((p) => (collabMap[p.id]?.length ?? 0) > 0 && !sharedIds.has(p.id))
    setCollab([...collaborative, ...ownedShared].map(attach))
    setArchived(arch.map(attach))
    setTeam(teamProjects.map(attach))
    setProfiles((allProfiles ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Deep-link from a portfolio prompt: ?new=1 opens the form, ?year= presets it.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('new') === '1') setShowForm(true)
    const y = Number(sp.get('year'))
    if (Number.isFinite(y) && y > 2000) setNewYear(y)
  }, [])

  const handleCreate = async (data: Partial<Project>, collaborators: Profile[]) => {
    if (!userId) return
    setSaveError(null)
    const { data: project, error } = await supabase.from('projects').insert({
      title: data.title,
      description: data.description ?? null,
      owner_id: userId,
      status: data.status ?? 'planning',
      school_year_start: data.school_year_start ?? currentSchoolYear(),
      start_date: data.start_date ?? null,
      target_date: data.target_date ?? null,
      visibility: data.visibility ?? 'normal',
    }).select().single()
    if (error) { setSaveError(error.message); return }

    if (collaborators.length > 0) {
      const { error: cErr } = await supabase.from('project_collaborators').insert(collaborators.map((p) => ({ project_id: project.id, user_id: p.id })))
      if (cErr) { setSaveError(`Project created, but adding collaborators failed: ${cErr.message}`); load(); return }
    }
    setShowForm(false)
    load()
  }

  const setStatus = async (id: string, status: ProjectStatus) => {
    setSaveError(null)
    const { data, error } = await supabase.from('projects').update({ status }).eq('id', id).select()
    if (error) { setSaveError(error.message); return }
    if (!data || data.length === 0) { setSaveError('Could not update this project (you may not have permission).'); return }
    load()
  }
  const handleDelete = async (id: string) => {
    setSaveError(null)
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select()
    if (error) { setSaveError(error.message); return }
    if (!data || data.length === 0) { setSaveError('Could not delete this project (you may not have permission).'); return }
    load()
  }

  const tabs: TabId[] = ['mine', 'collab']
  if (supervisees.length > 0) tabs.push('team')
  tabs.push('archived')
  const tabLabel = (t: TabId) => t === 'mine' ? 'My Projects' : t === 'collab' ? 'Collaborative' : t === 'team' ? "My Team's Projects" : 'Archived'
  const current = tab === 'mine' ? mine : tab === 'collab' ? collab : tab === 'team' ? team : archived

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('tab', tab === t ? 'tab-active' : 'tab-inactive')}>
              {tabLabel(t)}{t === 'team' && team.length > 0 ? ` (${team.length})` : ''}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ New Project</button>
      </div>

      {saveError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{saveError}</div>}

      {showForm && (
        <ProjectForm onSave={handleCreate} onCancel={() => { setShowForm(false); setSaveError(null) }} profiles={profiles} currentUserId={userId} defaultYear={newYear} defaultPrivate={defaultPrivate} />
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-40 animate-pulse bg-gray-100" />)}</div>
      ) : current.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>{tab === 'mine' ? 'No projects yet — start one to build your portfolio.' : tab === 'team' ? 'No projects from your team yet.' : 'Nothing here.'}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {current.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              currentUserId={userId}
              showOwner={tab === 'team'}
              onArchive={(id) => setStatus(id, 'archived')}
              onRestore={(id) => setStatus(id, 'active')}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
