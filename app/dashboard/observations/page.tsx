'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Observation, Profile, Framework, FrameworkDomain, ObsType } from '@/lib/types'
import PersonPicker from '@/components/PersonPicker'
import clsx from 'clsx'

const OBS_TYPES: ObsType[] = ['formal', 'informal', 'walkthrough', 'self']

const ratingLabels = ['', 'Developing', 'Basic', 'Proficient', 'Distinguished']
const ratingColors = ['', 'bg-red-100 text-red-700', 'bg-yellow-100 text-yellow-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700']

function ObservationCard({
  obs,
  onSignOff,
  currentUserId,
}: {
  obs: Observation
  onSignOff: (id: string) => void
  currentUserId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const canSignOff = !obs.signed_off && obs.observed_id === currentUserId

  return (
    <div className="card overflow-hidden">
      <div
        className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-navy capitalize">{obs.obs_type}</span>
              {obs.signed_off && (
                <span className="badge badge-green">Signed Off</span>
              )}
            </div>
            <p className="font-semibold text-gray-900">
              {obs.framework
                ? (obs.framework as unknown as Framework).title
                : 'General Observation'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              Observer: {obs.observer
                ? `${(obs.observer as unknown as Profile).first_name} ${(obs.observer as unknown as Profile).last_name}`
                : 'Unknown'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm text-gray-500">
              {new Date(obs.observed_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
            <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {obs.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observer Notes</p>
              <p className="text-sm text-gray-700">{obs.notes}</p>
            </div>
          )}

          {obs.ratings && obs.ratings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Domain Ratings</p>
              <div className="space-y-2">
                {obs.ratings.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4">
                    <p className="text-sm text-gray-700">
                      {r.domain ? (r.domain as unknown as FrameworkDomain).title : `Domain ${r.domain_id.slice(0, 6)}`}
                    </p>
                    <span className={`badge text-xs shrink-0 ${ratingColors[r.rating]}`}>
                      {ratingLabels[r.rating]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canSignOff && (
            <button
              onClick={(e) => { e.stopPropagation(); onSignOff(obs.id) }}
              className="btn-primary text-sm"
            >
              Sign Off Observation
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface NewObsForm {
  observed_id: string
  framework_id: string
  obs_type: ObsType
  observed_at: string
  notes: string
  ratings: Record<string, { rating: number; notes: string }>
}

export default function ObservationsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'mine' | 'pending'>('mine')
  const [observations, setObservations] = useState<Observation[]>([])
  const [pending, setPending] = useState<Observation[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('staff')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Profile | null>(null)
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null)
  const [form, setForm] = useState<NewObsForm>({
    observed_id: '',
    framework_id: '',
    obs_type: 'informal',
    observed_at: new Date().toISOString().slice(0, 16),
    notes: '',
    ratings: {},
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    setUserRole(profile?.role ?? 'staff')

    const obsSelect = `
      *,
      observer:profiles!observations_observer_id_fkey(id, first_name, last_name, title),
      observed:profiles!observations_observed_id_fkey(id, first_name, last_name, title),
      framework:frameworks(id, title),
      ratings:observation_ratings(*, domain:framework_domains(id, title))
    `

    const [{ data: mine }, { data: pendingObs }, { data: profs }, { data: fws }] = await Promise.all([
      supabase
        .from('observations')
        .select(obsSelect)
        .eq('observed_id', user.id)
        .order('observed_at', { ascending: false }),
      supabase
        .from('observations')
        .select(obsSelect)
        .eq('signed_off', false)
        .or(`observer_id.eq.${user.id},observed_id.eq.${user.id}`)
        .order('observed_at', { ascending: false }),
      supabase.from('profiles').select('*').order('first_name'),
      supabase.from('frameworks').select('*, domains:framework_domains(*, indicators:framework_indicators(*))').order('title'),
    ])

    setObservations((mine ?? []) as unknown as Observation[])
    setPending((pendingObs ?? []) as unknown as Observation[])
    setProfiles((profs ?? []) as Profile[])
    setFrameworks((fws ?? []) as unknown as Framework[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSignOff = async (obsId: string) => {
    await supabase
      .from('observations')
      .update({ signed_off: true, signed_off_at: new Date().toISOString() })
      .eq('id', obsId)
    load()
  }

  const handleFrameworkChange = (fwId: string) => {
    const fw = frameworks.find((f) => f.id === fwId) ?? null
    setSelectedFramework(fw)
    setForm((prev) => ({ ...prev, framework_id: fwId, ratings: {} }))
  }

  const setRating = (domainId: string, rating: number) => {
    setForm((prev) => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [domainId]: { ...prev.ratings[domainId], rating },
      },
    }))
  }

  const setRatingNote = (domainId: string, notes: string) => {
    setForm((prev) => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [domainId]: { ...prev.ratings[domainId], notes },
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSubmitting(true)
    setFormError(null)

    try {
      const { data: obs, error: obsErr } = await supabase
        .from('observations')
        .insert({
          observer_id: userId,
          observed_id: form.observed_id,
          framework_id: form.framework_id || null,
          obs_type: form.obs_type,
          observed_at: new Date(form.observed_at).toISOString(),
          notes: form.notes || null,
        })
        .select()
        .single()

      if (obsErr) throw obsErr

      const ratingEntries = Object.entries(form.ratings)
      if (ratingEntries.length > 0) {
        const { error: ratingErr } = await supabase.from('observation_ratings').insert(
          ratingEntries.map(([domainId, { rating, notes }]) => ({
            observation_id: obs.id,
            domain_id: domainId,
            rating,
            notes: notes || null,
          }))
        )
        if (ratingErr) throw ratingErr
      }

      setShowForm(false)
      setForm({
        observed_id: '',
        framework_id: '',
        obs_type: 'informal',
        observed_at: new Date().toISOString().slice(0, 16),
        notes: '',
        ratings: {},
      })
      setSelectedPerson(null)
      setSelectedFramework(null)
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save observation')
    } finally {
      setSubmitting(false)
    }
  }

  const currentObs = tab === 'mine' ? observations : pending
  const isSupervisorOrAdmin = userRole === 'supervisor' || userRole === 'admin'

  const hasRating = Object.values(form.ratings).some((r) => r.rating >= 1)
  // Frameworks without domains can't be rated — don't block submission for those.
  const frameworkHasDomains = Boolean(selectedFramework?.domains?.length)
  const canSubmit =
    Boolean(form.observed_id) &&
    Boolean(form.framework_id) &&
    Boolean(form.observed_at) &&
    (hasRating || !frameworkHasDomains)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('mine')}
            className={clsx('tab', tab === 'mine' ? 'tab-active' : 'tab-inactive')}
          >
            My Observations
          </button>
          <button
            onClick={() => setTab('pending')}
            className={clsx('tab', tab === 'pending' ? 'tab-active' : 'tab-inactive')}
          >
            Pending Sign-Off
          </button>
        </div>
        {isSupervisorOrAdmin && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
            + New Observation
          </button>
        )}
      </div>

      {/* New observation form */}
      {showForm && isSupervisorOrAdmin && (
        <div className="card p-6 space-y-5">
          <h3 className="font-semibold text-gray-900 text-lg">New Observation</h3>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Staff Member <span className="text-red-500">*</span></label>
                <PersonPicker
                  profiles={profiles}
                  exclude={userId ? [userId] : []}
                  value={selectedPerson}
                  onChange={(p) => {
                    setSelectedPerson(p)
                    setForm((prev) => ({ ...prev, observed_id: p?.id ?? '' }))
                  }}
                  placeholder="Search staff by name or title…"
                />
              </div>
              <div>
                <label className="label">Framework <span className="text-red-500">*</span></label>
                <select
                  required
                  className="input"
                  value={form.framework_id}
                  onChange={(e) => handleFrameworkChange(e.target.value)}
                >
                  <option value="">Select framework…</option>
                  {frameworks.map((fw) => (
                    <option key={fw.id} value={fw.id}>{fw.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={form.obs_type}
                  onChange={(e) => setForm({ ...form, obs_type: e.target.value as ObsType })}
                >
                  {OBS_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date & Time <span className="text-red-500">*</span></label>
                <input
                  type="datetime-local"
                  required
                  className="input"
                  value={form.observed_at}
                  onChange={(e) => setForm({ ...form, observed_at: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">Observation Notes</label>
              <textarea
                rows={4}
                className="input resize-none"
                placeholder="Describe what you observed…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* Domain ratings */}
            {selectedFramework && selectedFramework.domains && selectedFramework.domains.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-800">Domain Ratings</h4>
                {selectedFramework.domains.map((domain) => (
                  <div key={domain.id} className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="font-medium text-sm text-gray-800">{domain.title}</p>
                    {domain.description && (
                      <p className="text-xs text-gray-500">{domain.description}</p>
                    )}
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setRating(domain.id, rating)}
                          className={clsx(
                            'flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
                            form.ratings[domain.id]?.rating === rating
                              ? 'bg-navy-900 text-white border-navy-900'
                              : 'border-gray-200 text-gray-500 hover:border-navy-400 bg-white'
                          )}
                        >
                          {rating} — {ratingLabels[rating]}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Notes for this domain (optional)"
                      className="input text-sm"
                      value={form.ratings[domain.id]?.notes ?? ''}
                      onChange={(e) => setRatingNote(domain.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !canSubmit} className="btn-primary flex-1">
                {submitting ? 'Saving…' : 'Save Observation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Observation list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)}
        </div>
      ) : currentObs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No observations in this section.
        </div>
      ) : (
        <div className="space-y-3">
          {currentObs.map((obs) => (
            <ObservationCard
              key={obs.id}
              obs={obs}
              onSignOff={handleSignOff}
              currentUserId={userId ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}
