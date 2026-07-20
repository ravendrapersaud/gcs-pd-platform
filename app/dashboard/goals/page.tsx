'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Profile, GoalStatus } from '@/lib/types'
import clsx from 'clsx'

type TabId = 'mine' | 'collab' | 'archived'

const statusColor: Record<GoalStatus, string> = {
  active: 'badge-green',
  completed: 'badge-navy',
  archived: 'badge-gray',
  paused: 'badge-yellow',
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-navy-700 h-2 rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

interface GoalCardProps {
  goal: Goal
  onUpdate: (goalId: string, pct: number, note: string) => Promise<void>
  onEdit: (goal: Goal) => void
}

function GoalCard({ goal, onUpdate, onEdit }: GoalCardProps) {
  const [showUpdate, setShowUpdate] = useState(false)
  const [note, setNote] = useState('')
  const [pct, setPct] = useState(goal.progress_pct)
  const [saving, setSaving] = useState(false)

  const handleUpdate = async () => {
    setSaving(true)
    await onUpdate(goal.id, pct, note)
    setNote('')
    setSaving(false)
    setShowUpdate(false)
  }

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 leading-snug">{goal.title}</h3>
        <span className={`badge ${statusColor[goal.status]} shrink-0`}>{goal.status}</span>
      </div>

      {goal.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{goal.description}</p>
      )}

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{goal.progress_pct}%</span>
        </div>
        <ProgressBar pct={goal.progress_pct} />
      </div>

      {goal.due_date && (
        <p className="text-xs text-gray-400">
          Due {new Date(goal.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {/* Update form */}
      {showUpdate && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
          <div>
            <label className="label text-xs">New progress %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="input text-sm"
            />
          </div>
          <div>
            <label className="label text-xs">Update note</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input text-sm resize-none"
              placeholder="What progress was made?"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpdate(false)}
              className="btn-secondary text-xs flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="btn-primary text-xs flex-1"
            >
              {saving ? 'Saving…' : 'Save Update'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setShowUpdate(!showUpdate)}
          className="btn-ghost text-xs flex-1"
        >
          Add Update
        </button>
        <button onClick={() => onEdit(goal)} className="btn-secondary text-xs flex-1">
          Edit
        </button>
      </div>
    </div>
  )
}

interface GoalFormProps {
  onSave: (data: Partial<Goal>) => Promise<void>
  onCancel: () => void
  initial?: Partial<Goal>
  profiles: Profile[]
}

function GoalForm({ onSave, onCancel, initial, profiles }: GoalFormProps) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    due_date: initial?.due_date ?? '',
  })
  const [coOwner, setCoOwner] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      ...initial,
      title: form.title,
      description: form.description || undefined,
      due_date: form.due_date || undefined,
    })
    setSaving(false)
  }

  const filteredProfiles = profiles.filter(
    (p) =>
      coOwner &&
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(coOwner.toLowerCase())
  )

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">{initial?.id ? 'Edit Goal' : 'New Goal'}</h3>
      <div>
        <label className="label">Title <span className="text-red-500">*</span></label>
        <input
          className="input"
          required
          placeholder="Goal title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          rows={3}
          className="input resize-none"
          placeholder="What does success look like?"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Due Date</label>
        <input
          type="date"
          className="input"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
        />
      </div>
      <div className="relative">
        <label className="label">Co-owner (search by name)</label>
        <input
          className="input"
          placeholder="Search colleague…"
          value={coOwner}
          onChange={(e) => setCoOwner(e.target.value)}
        />
        {filteredProfiles.length > 0 && (
          <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
            {filteredProfiles.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="px-4 py-2 text-sm hover:bg-navy-50 cursor-pointer"
                onClick={() => setCoOwner(`${p.first_name} ${p.last_name}`)}
              >
                {p.first_name} {p.last_name}
                <span className="text-gray-400 text-xs ml-2">{p.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex-1">
          {saving ? 'Saving…' : initial?.id ? 'Update Goal' : 'Create Goal'}
        </button>
      </div>
    </div>
  )
}

export default function GoalsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabId>('mine')
  const [goals, setGoals] = useState<Goal[]>([])
  const [collabGoals, setCollabGoals] = useState<Goal[]>([])
  const [archivedGoals, setArchivedGoals] = useState<Goal[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)

  const loadGoals = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: myGoals }, { data: collabs }, { data: archived }, { data: allProfiles }] =
      await Promise.all([
        supabase
          .from('goals')
          .select('*')
          .eq('owner_id', user.id)
          .in('status', ['active', 'completed', 'paused'])
          .order('created_at', { ascending: false }),
        supabase
          .from('goal_collaborators')
          .select('goals(*)')
          .eq('user_id', user.id),
        supabase
          .from('goals')
          .select('*')
          .eq('owner_id', user.id)
          .eq('status', 'archived'),
        supabase.from('profiles').select('*').order('first_name'),
      ])

    setGoals((myGoals ?? []) as Goal[])
    setCollabGoals(
      (collabs ?? []).flatMap((c) => (c.goals ? [c.goals as unknown as Goal] : []))
    )
    setArchivedGoals((archived ?? []) as Goal[])
    setProfiles((allProfiles ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadGoals()
  }, [loadGoals])

  const handleCreate = async (data: Partial<Goal>) => {
    if (!userId) return
    await supabase.from('goals').insert({
      title: data.title,
      description: data.description ?? null,
      due_date: data.due_date ?? null,
      owner_id: userId,
      progress_pct: 0,
      status: 'active',
    })
    setShowForm(false)
    loadGoals()
  }

  const handleEdit = async (data: Partial<Goal>) => {
    if (!data.id) return
    await supabase
      .from('goals')
      .update({ title: data.title, description: data.description, due_date: data.due_date })
      .eq('id', data.id)
    setEditGoal(null)
    loadGoals()
  }

  const handleUpdate = async (goalId: string, pct: number, note: string) => {
    if (!userId) return
    await Promise.all([
      supabase.from('goals').update({ progress_pct: pct }).eq('id', goalId),
      note.trim()
        ? supabase.from('goal_updates').insert({
            goal_id: goalId,
            author_id: userId,
            content: note,
            progress_pct: pct,
          })
        : Promise.resolve(),
    ])
    loadGoals()
  }

  const currentGoals =
    tab === 'mine' ? goals : tab === 'collab' ? collabGoals : archivedGoals

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tabs + Add */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2">
          {(['mine', 'collab', 'archived'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx('tab capitalize', tab === t ? 'tab-active' : 'tab-inactive')}
            >
              {t === 'mine' ? 'My Goals' : t === 'collab' ? 'Collaborative' : 'Archived'}
            </button>
          ))}
        </div>
        {tab === 'mine' && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            + Add Goal
          </button>
        )}
      </div>

      {/* New goal form */}
      {showForm && (
        <GoalForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          profiles={profiles}
        />
      )}

      {/* Edit form */}
      {editGoal && (
        <GoalForm
          initial={editGoal}
          onSave={handleEdit}
          onCancel={() => setEditGoal(null)}
          profiles={profiles}
        />
      )}

      {/* Goal grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : currentGoals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No goals in this section.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {currentGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onUpdate={handleUpdate}
              onEdit={setEditGoal}
            />
          ))}
        </div>
      )}
    </div>
  )
}
