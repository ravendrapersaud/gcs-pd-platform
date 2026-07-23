'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Workspace } from '@/lib/types'
import { DIVISIONS, EMPLOYEE_TYPES } from '@/lib/taxonomy'
import { workspaceCreationPolicy } from '@/lib/appSettings'

function RuleBadges({ ws }: { ws: Workspace }) {
  const hasRules = ws.rule_division || ws.rule_department || ws.rule_employee_type
  if (!hasRules) return <span className="badge badge-gray">Manual membership</span>
  return (
    <>
      {ws.rule_division && <span className="badge badge-navy">{ws.rule_division}</span>}
      {ws.rule_department && <span className="badge badge-gray">{ws.rule_department}</span>}
      {ws.rule_employee_type && (
        <span className="badge badge-gray capitalize">{ws.rule_employee_type}</span>
      )}
    </>
  )
}

export default function WorkspacesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [myIds, setMyIds] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [creationPolicy, setCreationPolicy] = useState<'supervisors' | 'everyone'>('supervisors')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    rule_division: '',
    rule_department: '',
    rule_employee_type: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: prof, error: profErr }, { data: wss, error: wsErr }, { data: members, error: memErr }, { data: settings }] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('workspaces').select('*').order('name'),
        supabase.from('workspace_members').select('workspace_id, user_id'),
        supabase.from('app_settings').select('key, value'),
      ])

    setCreationPolicy(workspaceCreationPolicy(settings))

    const firstErr = profErr ?? wsErr ?? memErr
    if (firstErr) setError(`Failed to load workspaces: ${firstErr.message}`)

    const counts: Record<string, number> = {}
    const mine = new Set<string>()
    for (const m of members ?? []) {
      counts[m.workspace_id] = (counts[m.workspace_id] ?? 0) + 1
      if (m.user_id === user.id) mine.add(m.workspace_id)
    }

    setProfile((prof ?? null) as Profile | null)
    setWorkspaces(
      ((wss ?? []) as Workspace[]).map((w) => ({ ...w, member_count: counts[w.id] ?? 0 }))
    )
    setMyIds(mine)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const canCreate =
    creationPolicy === 'everyone' ||
    profile?.role === 'supervisor' || profile?.role === 'admin' || profile?.can_create_workspaces

  const handleCreate = async () => {
    if (!profile) return
    if (!form.name.trim()) {
      setError('Workspace name is required.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: ws, error: insErr } = await supabase
      .from('workspaces')
      .insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        rule_division: form.rule_division || null,
        rule_department: form.rule_department.trim() || null,
        rule_employee_type: form.rule_employee_type || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (insErr || !ws) {
      setError(`Could not create workspace: ${insErr?.message ?? 'no row returned'}`)
      setSaving(false)
      return
    }

    // Add the creator as a manager member.
    const { error: memErr } = await supabase.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: profile.id,
      is_manager: true,
      added_via: 'manual',
    })
    if (memErr) {
      setError(`Workspace created, but adding you as manager failed: ${memErr.message}`)
    }

    // Auto-populate rule-based members.
    const { data: added, error: syncErr } = await supabase.rpc('sync_workspace_members', {
      ws_id: ws.id,
    })
    if (syncErr) {
      setError(`Workspace created, but member sync failed: ${syncErr.message}`)
    } else {
      setNotice(
        `"${ws.name}" created — ${added ?? 0} member${added === 1 ? '' : 's'} auto-added by rules.`
      )
    }

    setForm({ name: '', description: '', rule_division: '', rule_department: '', rule_employee_type: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const handleJoin = async (wsId: string) => {
    if (!profile) return
    setJoiningId(wsId)
    setError(null)
    const { error: joinErr } = await supabase.from('workspace_members').insert({
      workspace_id: wsId,
      user_id: profile.id,
      is_manager: false,
      added_via: 'manual',
    })
    if (joinErr) {
      setError(`Could not join workspace: ${joinErr.message}`)
      setJoiningId(null)
      return
    }
    setJoiningId(null)
    load()
  }

  const myWorkspaces = workspaces.filter((w) => myIds.has(w.id))
  const otherWorkspaces = workspaces.filter((w) => !myIds.has(w.id))

  const WorkspaceCard = ({ ws, joined }: { ws: Workspace; joined: boolean }) => (
    <div
      className="card p-5 hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-3"
      onClick={() => router.push(`/dashboard/workspaces/${ws.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display font-bold text-navy-900">{ws.name}</h3>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {ws.member_count} member{ws.member_count === 1 ? '' : 's'}
        </span>
      </div>
      {ws.description && (
        <p className="text-sm text-gray-600 line-clamp-2">{ws.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-auto">
        <RuleBadges ws={ws} />
      </div>
      {!joined && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleJoin(ws.id)
          }}
          disabled={joiningId === ws.id}
          className="btn-secondary text-sm self-start"
        >
          {joiningId === ws.id ? 'Joining…' : 'Join'}
        </button>
      )}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {notice}
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Group spaces for teams and departments — share resources and post meeting notes.
        </p>
        {canCreate && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
            {showForm ? 'Cancel' : '+ New Workspace'}
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showForm && canCreate && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-gray-900">New Workspace</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. MS Math"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={2}
                placeholder="What is this space for?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Auto-add by Division</label>
              <select
                className="input"
                value={form.rule_division}
                onChange={(e) => setForm({ ...form, rule_division: e.target.value })}
              >
                <option value="">No rule</option>
                {DIVISIONS.map((d) => (
                  <option key={d.code} value={d.name}>{d.name}</option>
                ))}
                <option value="All School">All School</option>
              </select>
            </div>
            <div>
              <label className="label">Auto-add by Department</label>
              <input
                className="input"
                placeholder="e.g. Mathematics"
                value={form.rule_department}
                onChange={(e) => setForm({ ...form, rule_department: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Auto-add by Employee Type</label>
              <select
                className="input"
                value={form.rule_employee_type}
                onChange={(e) => setForm({ ...form, rule_employee_type: e.target.value })}
              >
                <option value="">No rule</option>
                {EMPLOYEE_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Members matching all of the rules you set are added automatically. Leave all rules
            blank for a manual-membership space. You can always add or remove people later.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {/* My workspaces */}
          <section className="space-y-3">
            <h2 className="font-display font-bold text-navy-900 text-lg">My workspaces</h2>
            {myWorkspaces.length === 0 ? (
              <p className="text-sm text-gray-400">
                You&apos;re not in any workspaces yet — browse below and join one.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myWorkspaces.map((ws) => (
                  <WorkspaceCard key={ws.id} ws={ws} joined />
                ))}
              </div>
            )}
          </section>

          {/* All workspaces */}
          <section className="space-y-3">
            <h2 className="font-display font-bold text-navy-900 text-lg">All workspaces</h2>
            {otherWorkspaces.length === 0 ? (
              <p className="text-sm text-gray-400">No other workspaces to browse.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherWorkspaces.map((ws) => (
                  <WorkspaceCard key={ws.id} ws={ws} joined={false} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
