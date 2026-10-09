'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Profile, GoalStatus, GoalType } from '@/lib/types'
import { facultyGoalQuestionDue, DEFAULT_FACULTY_GOAL_QUESTION_DUE } from '@/lib/appSettings'
import PersonPicker from '@/components/PersonPicker'
import clsx from 'clsx'

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`badge ${statusColor[goal.status]}`}>{goal.status}</span>
          {goal.goal_type === 'faculty_inquiry' && <span className="badge badge-navy">Inquiry</span>}
        </div>
      </div>

      {goal.goal_type === 'faculty_inquiry' ? (
        (goal.details?.capture || goal.details?.reflection) && (
          <div className="text-sm text-gray-500 space-y-1">
            {goal.details?.capture && <p className="line-clamp-2"><span className="text-gray-400">Capture:</span> {goal.details.capture}</p>}
            {goal.details?.reflection && <p className="line-clamp-2"><span className="text-gray-400">Reflect:</span> {goal.details.reflection}</p>}
          </div>
        )
      ) : (
        goal.description && <p className="text-sm text-gray-500 line-clamp-2">{goal.description}</p>
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

      {goal.collaborators && goal.collaborators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {goal.collaborators.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 bg-navy-50 text-navy-800 border border-navy-100 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium"
            >
              <span className="w-4 h-4 rounded-full bg-navy-200 text-navy-900 text-[9px] font-bold flex items-center justify-center">
                {(c.first_name?.[0] ?? '')}{(c.last_name?.[0] ?? '')}
              </span>
              {c.first_name} {c.last_name}
            </span>
          ))}
        </div>
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
  onSave: (data: Partial<Goal>, collaborators: Profile[]) => Promise<void>
  onCancel: () => void
  initial?: Partial<Goal>
  profiles: Profile[]
  currentUserId?: string | null
  defaultVariant: GoalType
  questionDue: string
}

function GoalForm({ onSave, onCancel, initial, profiles, currentUserId, defaultVariant, questionDue }: GoalFormProps) {
  const editing = Boolean(initial?.id)
  const [variant, setVariant] = useState<GoalType>(initial?.goal_type ?? defaultVariant)
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    due_date: initial?.due_date ?? '',
    question: initial?.details?.question ?? (initial?.goal_type === 'faculty_inquiry' ? initial?.title ?? '' : ''),
    capture: initial?.details?.capture ?? '',
    reflection: initial?.details?.reflection ?? '',
  })
  const [collaborators, setCollaborators] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)

  const overdue = new Date().toISOString().slice(0, 10) > questionDue
  const canSave = variant === 'faculty_inquiry' ? form.question.trim().length > 0 : form.title.trim().length > 0

  const handleSave = async () => {
    setSaving(true)
    if (variant === 'faculty_inquiry') {
      await onSave({
        ...initial,
        goal_type: 'faculty_inquiry',
        title: form.question.trim(),
        description: null,
        details: { question: form.question.trim(), capture: form.capture.trim(), reflection: form.reflection.trim() },
        due_date: form.due_date || undefined,
      }, collaborators)
    } else {
      await onSave({
        ...initial,
        goal_type: 'standard',
        title: form.title,
        description: form.description || undefined,
        details: null,
        due_date: form.due_date || undefined,
      }, collaborators)
    }
    setSaving(false)
  }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">{editing ? 'Edit Goal' : 'New Goal'}</h3>

      {!editing && (
        <div className="flex gap-2">
          {([['faculty_inquiry', 'Faculty inquiry goal'], ['standard', 'Standard goal']] as [GoalType, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setVariant(v)} className={clsx('tab', variant === v ? 'tab-active' : 'tab-inactive')}>{label}</button>
          ))}
        </div>
      )}

      {variant === 'faculty_inquiry' ? (
        <div className="space-y-4">
          <div>
            <label className="label">1. Formulate a question about your classroom culture or pedagogical practices.</label>
            <textarea rows={2} className="input resize-none" placeholder="Your inquiry question…" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
            <p className={clsx('text-xs mt-1', overdue ? 'text-red-600 font-medium' : 'text-gray-400')}>
              {overdue ? `Past the ${fmtDate(questionDue)} deadline for the question.` : `Formulate your question by ${fmtDate(questionDue)}.`}
            </p>
          </div>
          <div>
            <label className="label">2. How will you systematically capture low-stakes (non-evaluative) information about your question?</label>
            <textarea rows={3} className="input resize-none" placeholder="Journaling, peer observation, exit tickets, etc." value={form.capture} onChange={(e) => setForm({ ...form, capture: e.target.value })} />
          </div>
          <div>
            <label className="label">3. How will you reflect on what you find, and develop an action plan?</label>
            <textarea rows={3} className="input resize-none" value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="label">Title <span className="text-red-500">*</span></label>
            <input className="input" required placeholder="Goal title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={3} className="input resize-none" placeholder="What does success look like?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </>
      )}

      <div>
        <label className="label">{variant === 'faculty_inquiry' ? 'Overall target date (optional)' : 'Due Date'}</label>
        <input type="date" className="input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      </div>

      {!editing && (
        <div>
          <label className="label">Co-owners</label>
          <PersonPicker multiple profiles={profiles} exclude={currentUserId ? [currentUserId] : []} value={collaborators} onChange={setCollaborators} placeholder="Search colleagues by name…" />
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSave} disabled={saving || !canSave} className="btn-primary flex-1">
          {saving ? 'Saving…' : editing ? 'Update Goal' : 'Create Goal'}
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
  const [myEmployeeType, setMyEmployeeType] = useState<string | null>(null)
  const [questionDue, setQuestionDue] = useState<string>(DEFAULT_FACULTY_GOAL_QUESTION_DUE)
  const [showForm, setShowForm] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadGoals = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: myGoals }, { data: collabs }, { data: archived }, { data: allProfiles }, { data: settings }] =
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
        supabase.from('app_settings').select('key, value'),
      ])

    const me = (allProfiles ?? []).find((p) => p.id === user.id) as Profile | undefined
    setMyEmployeeType(me?.employee_type ?? null)
    setQuestionDue(facultyGoalQuestionDue(settings))

    const mine = (myGoals ?? []) as Goal[]
    const collaborative = (collabs ?? []).flatMap((c) => (c.goals ? [c.goals as unknown as Goal] : []))
    const arch = (archived ?? []) as Goal[]

    // Batched fetch of collaborators for all visible goals.
    const allIds = Array.from(new Set([...mine, ...collaborative, ...arch].map((g) => g.id)))
    if (allIds.length > 0) {
      const { data: collabRows } = await supabase
        .from('goal_collaborators')
        .select('goal_id, profile:profiles(id, first_name, last_name, title)')
        .in('goal_id', allIds)

      const collabMap: Record<string, Profile[]> = {}
      for (const row of collabRows ?? []) {
        const p = row.profile as unknown as Profile | null
        if (!p) continue
        collabMap[row.goal_id] = [...(collabMap[row.goal_id] ?? []), p]
      }
      const attach = (g: Goal): Goal => ({ ...g, collaborators: collabMap[g.id] ?? [] })
      setGoals(mine.map(attach))
      setCollabGoals(collaborative.map(attach))
      setArchivedGoals(arch.map(attach))
    } else {
      setGoals(mine)
      setCollabGoals(collaborative)
      setArchivedGoals(arch)
    }

    setProfiles((allProfiles ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadGoals()
  }, [loadGoals])

  const handleCreate = async (data: Partial<Goal>, collaborators: Profile[]) => {
    if (!userId) return
    setSaveError(null)

    const { data: goal, error: goalErr } = await supabase
      .from('goals')
      .insert({
        title: data.title,
        description: data.description ?? null,
        due_date: data.due_date ?? null,
        owner_id: userId,
        progress_pct: 0,
        status: 'active',
        goal_type: data.goal_type ?? 'standard',
        details: data.details ?? null,
      })
      .select()
      .single()

    if (goalErr) {
      setSaveError(goalErr.message)
      return
    }

    if (collaborators.length > 0) {
      const { error: collabErr } = await supabase.from('goal_collaborators').insert(
        collaborators.map((p) => ({ goal_id: goal.id, user_id: p.id }))
      )
      if (collabErr) {
        setSaveError(`Goal was created, but adding co-owners failed: ${collabErr.message}`)
        loadGoals()
        return
      }
    }

    setShowForm(false)
    loadGoals()
  }

  const handleEdit = async (data: Partial<Goal>) => {
    if (!data.id) return
    setSaveError(null)
    const { error } = await supabase
      .from('goals')
      .update({ title: data.title, description: data.description ?? null, due_date: data.due_date ?? null, details: data.details ?? null })
      .eq('id', data.id)
    if (error) {
      setSaveError(error.message)
      return
    }
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

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {saveError}
        </div>
      )}

      {/* New goal form */}
      {showForm && (
        <GoalForm
          onSave={handleCreate}
          onCancel={() => { setShowForm(false); setSaveError(null) }}
          profiles={profiles}
          currentUserId={userId}
          defaultVariant={myEmployeeType === 'faculty' ? 'faculty_inquiry' : 'standard'}
          questionDue={questionDue}
        />
      )}

      {/* Edit form */}
      {editGoal && (
        <GoalForm
          initial={editGoal}
          onSave={handleEdit}
          onCancel={() => { setEditGoal(null); setSaveError(null) }}
          profiles={profiles}
          currentUserId={userId}
          defaultVariant={editGoal.goal_type ?? 'standard'}
          questionDue={questionDue}
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
