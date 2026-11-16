'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Cohort, Profile } from '@/lib/types'

export default function CohortsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    school_year: '',
    description: '',
    start_date: '',
    end_date: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: prof }, { data: cos, error: coErr }, { data: members }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('cohorts').select('*').order('created_at', { ascending: false }),
      supabase.from('cohort_members').select('cohort_id'),
    ])

    if (coErr) setError(`Failed to load cohorts: ${coErr.message}`)

    const counts: Record<string, number> = {}
    for (const m of members ?? []) counts[m.cohort_id] = (counts[m.cohort_id] ?? 0) + 1

    setProfile((prof ?? null) as Profile | null)
    setCohorts(((cos ?? []) as Cohort[]).map((c) => ({ ...c, member_count: counts[c.id] ?? 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const canManage = profile?.role === 'admin' || profile?.can_manage_cohorts === true

  const handleCreate = async () => {
    if (!profile) return
    if (!form.name.trim()) {
      setError('Cohort name is required.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)

    const { data: co, error: insErr } = await supabase
      .from('cohorts')
      .insert({
        name: form.name.trim(),
        school_year: form.school_year.trim() || null,
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (insErr || !co) {
      setError(`Could not create cohort: ${insErr?.message ?? 'no row returned (check permissions)'}`)
      setSaving(false)
      return
    }

    // Provision the shared cohort workspace.
    const { error: wsErr } = await supabase.rpc('ensure_cohort_workspace', { c: co.id })
    if (wsErr) setError(`Cohort created, but its workspace could not be set up: ${wsErr.message}`)

    setSaving(false)
    router.push(`/dashboard/cohorts/${co.id}`)
  }

  if (!loading && !canManage) {
    return (
      <div className="card p-6 text-sm text-gray-600">
        You don’t have access to cohort management. Ask an administrator if you should.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {notice && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{notice}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Onboarding groups for new faculty — a schedule, a checklist, bookable time, and a shared space.
        </p>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
            {showForm ? 'Cancel' : '+ New Cohort'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-gray-900">New Cohort</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. NEC26 — New Employee Cohort"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">School year</label>
              <input
                className="input"
                placeholder="e.g. 2026–27"
                value={form.school_year}
                onChange={(e) => setForm({ ...form, school_year: e.target.value })}
              />
            </div>
            <div />
            <div>
              <label className="label">Start date</label>
              <input
                type="date"
                className="input"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End date</label>
              <input
                type="date"
                className="input"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={2}
                placeholder="What is this cohort for?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            A shared workspace is created automatically and kept in sync with the roster you build next.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create Cohort'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : cohorts.length === 0 ? (
        <p className="text-sm text-gray-400">No cohorts yet — create one to get started.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/dashboard/cohorts/${c.id}`)}
              className="card p-5 text-left hover:shadow-md transition-shadow flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-bold text-navy-900">{c.name}</h3>
                {!c.is_active && <span className="badge badge-gray text-[10px]">Archived</span>}
              </div>
              {c.school_year && <p className="text-xs text-gray-400">{c.school_year}</p>}
              {c.description && <p className="text-sm text-gray-600 line-clamp-2">{c.description}</p>}
              <p className="text-xs text-gray-500 mt-auto pt-2">
                {c.member_count} member{c.member_count === 1 ? '' : 's'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
