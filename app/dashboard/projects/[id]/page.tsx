'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, ProjectStatus, ProjectMilestone, Profile, Goal } from '@/lib/types'
import PersonPicker from '@/components/PersonPicker'
import ProjectSyncs from '@/components/ProjectSyncs'
import { settingsMap } from '@/lib/appSettings'
import { trackForProfile, studentSupportDepartments, targetMatchesPerson } from '@/lib/tracks'
import clsx from 'clsx'

type TagIndicator = { id: string; title: string; order_index: number }
type TagDomain = { id: string; title: string; order_index: number; indicators: TagIndicator[] }
type TagFramework = { id: string; title: string; target_tracks?: string[]; target_roles?: string[]; domains: TagDomain[] }

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', complete: 'Complete', archived: 'Archived',
}
const EDITABLE_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'complete', 'archived']
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function driveFolderEmbed(url: string | null | undefined): { id: string; embed: string } | null {
  if (!url) return null
  const m = url.match(/\/folders\/([-\w]+)/) || url.match(/[?&]id=([-\w]+)/)
  if (!m) return null
  return { id: m[1], embed: `https://drive.google.com/embeddedfolderview?id=${m[1]}#grid` }
}

export default function ProjectDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const supabase = createClient()

  const [project, setProject] = useState<Project | null>(null)
  const [collaborators, setCollaborators] = useState<Profile[]>([])
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [linkedGoals, setLinkedGoals] = useState<{ id: string; title: string }[]>([])
  const [myGoals, setMyGoals] = useState<Goal[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editable detail fields
  const [form, setForm] = useState({ title: '', description: '', status: 'planning' as ProjectStatus, progress_pct: 0, target_date: '', drive_folder_url: '', visibility: 'normal' as 'normal' | 'private' })
  const [savingDetails, setSavingDetails] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  // Inline Drive-folder link editor (separate from the full Edit form, so a bad
  // or stale link can be fixed/removed straight from the Project files card).
  const [folderEditing, setFolderEditing] = useState(false)
  const [folderInput, setFolderInput] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)

  // Milestone / collaborator inputs
  const [mTitle, setMTitle] = useState('')
  const [mDue, setMDue] = useState('')
  const [addCollab, setAddCollab] = useState<Profile | null>(null)

  // Competency tagging (B): frameworks applicable to the owner + which
  // indicators this project is tagged against.
  const [tagFrameworks, setTagFrameworks] = useState<TagFramework[]>([])
  const [tagChecked, setTagChecked] = useState<Record<string, boolean>>({})
  const [savingTags, setSavingTags] = useState(false)
  const [tagsSaved, setTagsSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: proj, error: pErr }, { data: collabRows }, { data: ms }, { data: pg }, { data: allProfiles }, { data: goals }, { data: me }, { data: fws }, { data: settingsRows }, { data: tagRows }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('project_collaborators').select('profile:profiles(id, first_name, last_name, title)').eq('project_id', id),
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order', { ascending: true }),
      supabase.from('project_goals').select('goal:goals(id, title)').eq('project_id', id),
      supabase.from('profiles').select('*').order('first_name'),
      supabase.from('goals').select('*').eq('owner_id', user.id).in('status', ['active', 'completed', 'paused']).order('created_at', { ascending: false }),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('frameworks').select('id, title, target_tracks, target_roles, domains:framework_domains(id, title, order_index, indicators:framework_indicators(id, title, order_index))').order('title'),
      supabase.from('app_settings').select('key, value'),
      supabase.from('competency_evidence').select('indicator_id').eq('project_id', id).eq('source', 'project'),
    ])

    if (pErr || !proj) { setError('Could not load this project (it may not exist, or you may not have access).'); setLoading(false); return }
    const p = proj as Project
    setProject(p)
    setMyRole((me?.role as string) ?? null)

    // Competency tagging: frameworks applicable to the project OWNER — those
    // their track/role targets, PLUS any explicitly assigned as a focus.
    const owner = (allProfiles ?? []).find((x) => x.id === p.owner_id) as Profile | undefined
    const ownerTrack = trackForProfile((owner ?? {}) as Profile, studentSupportDepartments(settingsMap(settingsRows)))
    const ownerRoles = (owner?.roles) ?? []
    const { data: assignRows } = await supabase.from('competency_assignments').select('framework_id').eq('subject_id', p.owner_id)
    const assignedFwIds = new Set(((assignRows ?? []) as { framework_id: string }[]).map((r) => r.framework_id))
    const applicable = ((fws ?? []) as TagFramework[])
      .filter((fw) => assignedFwIds.has(fw.id) || targetMatchesPerson(fw.target_tracks, fw.target_roles, ownerTrack, ownerRoles))
      .map((fw) => ({
        ...fw,
        domains: (fw.domains ?? []).slice().sort((a, b) => a.order_index - b.order_index)
          .map((d) => ({ ...d, indicators: (d.indicators ?? []).slice().sort((a, b) => a.order_index - b.order_index) })),
      }))
    setTagFrameworks(applicable)
    const checkedMap: Record<string, boolean> = {}
    for (const r of (tagRows ?? []) as { indicator_id: string | null }[]) if (r.indicator_id) checkedMap[r.indicator_id] = true
    setTagChecked(checkedMap)
    setForm({
      title: p.title, description: p.description ?? '', status: p.status, progress_pct: p.progress_pct,
      target_date: p.target_date ?? '', drive_folder_url: p.drive_folder_url ?? '', visibility: p.visibility,
    })
    setCollaborators((collabRows ?? []).map((r) => r.profile as unknown as Profile).filter(Boolean))
    setMilestones((ms ?? []) as ProjectMilestone[])
    setLinkedGoals((pg ?? []).map((r) => r.goal as unknown as { id: string; title: string }).filter(Boolean))
    setProfiles((allProfiles ?? []) as Profile[])
    setMyGoals((goals ?? []) as Goal[])
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const isOwner = !!project && !!userId && project.owner_id === userId
  const isCollaborator = !!userId && collaborators.some((c) => c.id === userId)
  const canEdit = isOwner || isCollaborator || myRole === 'admin'

  const saveDetails = async () => {
    if (!project) return
    setSavingDetails(true); setError(null)
    const { data, error: err } = await supabase.from('projects').update({
      title: form.title.trim() || project.title,
      description: form.description.trim() || null,
      status: form.status,
      progress_pct: Math.max(0, Math.min(100, Number(form.progress_pct) || 0)),
      target_date: form.target_date || null,
      drive_folder_url: form.drive_folder_url.trim() || null,
      visibility: isOwner || myRole === 'admin' ? form.visibility : project.visibility,
      updated_at: new Date().toISOString(),
    }).eq('id', project.id).select()
    setSavingDetails(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not save (you may not have permission).'); return }
    setSavedTick(true); setTimeout(() => setSavedTick(false), 2000)
    load()
  }

  const saveFolder = async (url: string | null) => {
    if (!project) return
    setSavingFolder(true); setError(null)
    const { data, error: err } = await supabase.from('projects')
      .update({ drive_folder_url: url, updated_at: new Date().toISOString() })
      .eq('id', project.id).select('id')
    setSavingFolder(false)
    if (err) { setError(err.message); return }
    if (!data || data.length === 0) { setError('Could not update the folder link (you may not have permission).'); return }
    setFolderEditing(false); setFolderInput(''); load()
  }

  // Milestones
  const addMilestone = async () => {
    if (!mTitle.trim() || !project) return
    const { error: err } = await supabase.from('project_milestones').insert({ project_id: project.id, title: mTitle.trim(), due_date: mDue || null, sort_order: milestones.length })
    if (err) { setError(err.message); return }
    setMTitle(''); setMDue(''); load()
  }
  const toggleMilestone = async (m: ProjectMilestone) => {
    const { error: err } = await supabase.from('project_milestones').update({ done: !m.done }).eq('id', m.id)
    if (err) { setError(err.message); return }
    load()
  }
  const deleteMilestone = async (mId: string) => {
    const { error: err } = await supabase.from('project_milestones').delete().eq('id', mId)
    if (err) { setError(err.message); return }
    load()
  }

  // Collaborators (owner/admin)
  const addCollaborator = async () => {
    if (!addCollab || !project) return
    const { error: err } = await supabase.from('project_collaborators').insert({ project_id: project.id, user_id: addCollab.id })
    if (err) { setError(err.message); return }
    setAddCollab(null); load()
  }
  const removeCollaborator = async (uid: string) => {
    if (!project) return
    const { error: err } = await supabase.from('project_collaborators').delete().eq('project_id', project.id).eq('user_id', uid)
    if (err) { setError(err.message); return }
    load()
  }

  // Goal links
  const linkGoal = async (goalId: string) => {
    if (!goalId || !project) return
    const { error: err } = await supabase.from('project_goals').insert({ project_id: project.id, goal_id: goalId })
    if (err) { setError(err.message); return }
    load()
  }
  const unlinkGoal = async (goalId: string) => {
    if (!project) return
    const { error: err } = await supabase.from('project_goals').delete().eq('project_id', project.id).eq('goal_id', goalId)
    if (err) { setError(err.message); return }
    load()
  }

  // Competency tags (B): reconcile this project's evidence against the checked
  // indicators (delete-then-insert for this project's project-source rows).
  const saveTags = async () => {
    if (!project || !userId) return
    setSavingTags(true); setError(null)
    const { error: delErr } = await supabase.from('competency_evidence').delete().eq('project_id', project.id).eq('source', 'project')
    if (delErr) { setSavingTags(false); setError(`Saving competencies failed: ${delErr.message}`); return }
    const rows: Record<string, unknown>[] = []
    for (const fw of tagFrameworks) for (const d of fw.domains) for (const ind of d.indicators) {
      if (!tagChecked[ind.id]) continue
      rows.push({ subject_id: project.owner_id, framework_id: fw.id, domain_id: d.id, indicator_id: ind.id, source: 'project', project_id: project.id, note: null, author_id: userId })
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('competency_evidence').insert(rows)
      if (insErr) { setSavingTags(false); setError(`Saving competencies failed: ${insErr.message}`); return }
    }
    setSavingTags(false); setTagsSaved(true); setTimeout(() => setTagsSaved(false), 2000); load()
  }

  if (loading) return <div className="max-w-3xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>
  if (error && !project) return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card p-8 text-center text-gray-600">{error}</div>
      <Link href="/dashboard/projects" className="text-sm text-navy-700 hover:underline">← Back to Projects</Link>
    </div>
  )
  if (!project) return null

  const linkedIds = new Set(linkedGoals.map((g) => g.id))
  const linkableGoals = myGoals.filter((g) => !linkedIds.has(g.id))
  const doneCount = milestones.filter((m) => m.done).length

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/dashboard/projects" className="text-sm text-gray-500 hover:text-gray-700">← Back to Projects</Link>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Details */}
      <div className="card p-6 space-y-4">
        {canEdit ? (
          <>
            <div>
              <label className="label">Title</label>
              <input className="input font-semibold" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea rows={3} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                  {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Progress %</label>
                <input type="number" min={0} max={100} className="input" value={form.progress_pct} onChange={(e) => setForm({ ...form, progress_pct: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Target date</label>
                <input type="date" className="input" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Google Drive folder link <span className="text-gray-400 font-normal">(optional — the project hub)</span></label>
              <input className="input" placeholder="https://drive.google.com/drive/folders/…" value={form.drive_folder_url} onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value })} />
            </div>
            {(isOwner || myRole === 'admin') && (
              <div className="flex items-center gap-2">
                <input id="pd-private" type="checkbox" className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-navy-500"
                  checked={form.visibility === 'private'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'private' : 'normal' })} />
                <label htmlFor="pd-private" className="text-sm text-gray-700">Private <span className="text-gray-400">— me, my supervisor, and admins only</span></label>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={saveDetails} disabled={savingDetails} className="btn-primary">{savingDetails ? 'Saving…' : 'Save details'}</button>
              {savedTick && <span className="text-sm text-green-600">Saved ✓</span>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-display text-gray-900">{project.title}</h1>
              <span className="badge badge-gray shrink-0">{STATUS_LABEL[project.status]}</span>
            </div>
            {project.description && <p className="text-sm text-gray-600">{project.description}</p>}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Progress</span><span>{project.progress_pct}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-navy-700 h-2 rounded-full" style={{ width: `${Math.min(100, project.progress_pct)}%` }} /></div>
            </div>
            {project.target_date && <p className="text-xs text-gray-400">Target {fmtDate(project.target_date)}</p>}
          </>
        )}
        {project.owner && <p className="text-xs text-gray-400">Owner: {project.owner.first_name} {project.owner.last_name}{project.school_year_start ? ` · ${project.school_year_start}–${project.school_year_start + 1}` : ''}</p>}
      </div>

      {/* Milestones */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Milestones <span className="text-gray-400 font-normal">({doneCount}/{milestones.length})</span></h2>
        {milestones.length === 0 ? (
          <p className="text-sm text-gray-400">No milestones yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-3">
            {milestones.map((m) => (
              <li key={m.id} className="py-2 flex items-center gap-3">
                <input type="checkbox" checked={m.done} disabled={!canEdit} onChange={() => toggleMilestone(m)} className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-navy-500" />
                <span className={clsx('flex-1 text-sm min-w-0', m.done ? 'text-gray-400 line-through' : 'text-gray-800')}>{m.title}</span>
                {m.due_date && <span className="text-xs text-gray-400 shrink-0">{fmtDate(m.due_date)}</span>}
                {canEdit && <button onClick={() => deleteMilestone(m.id)} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="Add a milestone…" value={mTitle} onChange={(e) => setMTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone() }} />
            <input type="date" className="input sm:w-44" value={mDue} onChange={(e) => setMDue(e.target.value)} />
            <button onClick={addMilestone} disabled={!mTitle.trim()} className="btn-secondary shrink-0">Add</button>
          </div>
        )}
      </div>

      {/* Syncs & follow-ups — a sync cadence + owned action items for the team */}
      <ProjectSyncs
        projectId={project.id}
        participants={[profiles.find((pp) => pp.id === project.owner_id), ...collaborators].filter(Boolean) as Profile[]}
        canEdit={canEdit}
        syncFrequency={project.sync_frequency}
        nextSync={project.next_sync}
      />

      {/* Linked goals */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Goals this advances <span className="text-gray-400 font-normal">({linkedGoals.length})</span></h2>
        {linkedGoals.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">Not linked to any goals yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {linkedGoals.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="badge badge-navy shrink-0">Goal</span>
                <span className="flex-1 text-gray-800 min-w-0">{g.title}</span>
                {canEdit && <button onClick={() => unlinkGoal(g.id)} className="text-xs text-red-600 hover:underline shrink-0">Unlink</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && linkableGoals.length > 0 && (
          <select className="input text-sm" value="" onChange={(e) => { if (e.target.value) linkGoal(e.target.value) }}>
            <option value="">+ Link one of your goals…</option>
            {linkableGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        )}
      </div>

      {/* Competencies this advances (framework indicators) */}
      {(() => {
        const canTag = isOwner || myRole === 'admin'
        const taggedCount = Object.values(tagChecked).filter(Boolean).length
        if (tagFrameworks.length === 0 && taggedCount === 0) return null
        return (
          <div className="card p-6">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold text-gray-900">Competencies this advances <span className="text-gray-400 font-normal">({taggedCount})</span></h2>
              {canTag && (
                <div className="flex items-center gap-2">
                  {tagsSaved && <span className="text-sm text-green-600">Saved ✓</span>}
                  <button onClick={saveTags} disabled={savingTags} className="btn-secondary text-sm">{savingTags ? 'Saving…' : 'Save competencies'}</button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">Mark the indicators this project advances. They appear as evidence, grouped by area, on {project.owner ? `${project.owner.first_name}’s` : 'the owner’s'} portfolio.</p>
            {canTag ? (
              tagFrameworks.length === 0 ? (
                <p className="text-sm text-gray-400">No competency frameworks apply to this person yet.</p>
              ) : (
                <div className="space-y-4">
                  {tagFrameworks.map((fw) => (
                    <div key={fw.id} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-gray-400">{fw.title}</p>
                      {fw.domains.map((d) => (
                        <div key={d.id} className="rounded-lg border border-gray-100 p-3">
                          <p className="font-medium text-gray-900 text-sm mb-1.5">{d.title}</p>
                          <div className="space-y-1">
                            {d.indicators.map((ind) => (
                              <label key={ind.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" className="mt-0.5" checked={!!tagChecked[ind.id]} onChange={(e) => setTagChecked((c) => ({ ...c, [ind.id]: e.target.checked }))} />
                                <span>{ind.title}</span>
                              </label>
                            ))}
                            {d.indicators.length === 0 && <p className="text-xs text-gray-400">No indicators.</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Read-only: just the tagged indicator titles grouped by framework.
              <div className="space-y-2">
                {tagFrameworks.map((fw) => {
                  const hits = fw.domains.flatMap((d) => d.indicators.filter((i) => tagChecked[i.id]).map((i) => i.title))
                  if (hits.length === 0) return null
                  return (
                    <div key={fw.id}>
                      <p className="text-xs uppercase tracking-wide text-gray-400">{fw.title}</p>
                      <ul className="list-disc pl-5 text-sm text-gray-700">{hits.map((h, i) => <li key={i}>{h}</li>)}</ul>
                    </div>
                  )
                })}
                {taggedCount === 0 && <p className="text-sm text-gray-400">None tagged.</p>}
              </div>
            )}
          </div>
        )
      })()}

      {/* Collaborators */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Collaborators <span className="text-gray-400 font-normal">({collaborators.length})</span></h2>
        {collaborators.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">No collaborators yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {collaborators.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 bg-navy-50 text-navy-800 border border-navy-100 rounded-full pl-1 pr-2 py-0.5 text-xs font-medium">
                <span className="w-4 h-4 rounded-full bg-navy-200 text-navy-900 text-[9px] font-bold flex items-center justify-center">{(c.first_name?.[0] ?? '')}{(c.last_name?.[0] ?? '')}</span>
                {c.first_name} {c.last_name}
                {(isOwner || myRole === 'admin') && <button onClick={() => removeCollaborator(c.id)} className="text-navy-400 hover:text-red-600 ml-0.5" aria-label="Remove">×</button>}
              </span>
            ))}
          </div>
        )}
        {(isOwner || myRole === 'admin') && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <PersonPicker
                profiles={profiles}
                exclude={[project.owner_id, ...collaborators.map((c) => c.id)]}
                value={addCollab}
                onChange={setAddCollab}
                placeholder="Add a collaborator…"
              />
            </div>
            <button onClick={addCollaborator} disabled={!addCollab} className="btn-secondary shrink-0">Add</button>
          </div>
        )}
      </div>

      {/* Drive folder hub */}
      {(() => {
        const url = project.drive_folder_url
        const embed = driveFolderEmbed(url)
        const openEditor = () => { setFolderInput(url ?? ''); setFolderEditing(true) }

        // Inline editor — fix, replace, or remove the folder link.
        if (folderEditing) {
          return (
            <div className="card p-6 space-y-3">
              <h2 className="font-semibold text-gray-900">Project files</h2>
              <div>
                <label className="label">Google Drive folder link</label>
                <input className="input" placeholder="https://drive.google.com/drive/folders/…"
                  value={folderInput} onChange={(e) => setFolderInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveFolder(folderInput.trim() || null) }} />
                <p className="text-xs text-gray-400 mt-1">Paste a Drive <em>folder</em> link to embed its contents here. Its files are managed in Google Drive.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveFolder(folderInput.trim() || null)} disabled={savingFolder} className="btn-primary text-sm">{savingFolder ? 'Saving…' : 'Save link'}</button>
                {url && <button onClick={() => saveFolder(null)} disabled={savingFolder} className="btn-ghost text-sm text-red-600">Remove link</button>}
                <button onClick={() => { setFolderEditing(false); setError(null) }} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )
        }

        // Valid folder link → embed, with a Replace / Remove control for editors.
        if (embed) {
          return (
            <div className="card p-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold text-gray-900">Project files</h2>
                <div className="flex items-center gap-3 shrink-0">
                  <a href={`https://drive.google.com/drive/folders/${embed.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-navy-700 hover:underline">Open in Drive →</a>
                  {canEdit && <button onClick={openEditor} className="text-sm text-gray-500 hover:text-navy-700">Replace / Remove</button>}
                </div>
              </div>
              <iframe src={embed.embed} className="w-full rounded-lg border border-gray-200" style={{ height: 420 }} title="Project Drive folder" />
            </div>
          )
        }

        // A link is saved but isn't an embeddable folder URL — let editors fix it.
        if (url && canEdit) {
          return (
            <div className="card p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900">Project files</h2>
                  <p className="text-sm text-yellow-700 mt-1">The saved link isn&rsquo;t a Google Drive <em>folder</em> URL, so it can&rsquo;t be shown here.</p>
                  <p className="text-xs text-gray-500 mt-0.5 break-all">{url}</p>
                </div>
                <button onClick={openEditor} className="btn-secondary text-sm shrink-0">Fix / Remove</button>
              </div>
            </div>
          )
        }

        // No link yet — editors can add one without opening the full Edit form.
        if (!url && canEdit) {
          return (
            <button onClick={openEditor} className="card p-6 w-full text-left hover:shadow-md transition-shadow border-2 border-dashed border-gray-200">
              <h2 className="font-semibold text-gray-900">Project files</h2>
              <p className="text-sm text-gray-500 mt-1">Link a Google Drive folder to use as this project&rsquo;s hub.</p>
            </button>
          )
        }

        return null
      })()}
    </div>
  )
}
