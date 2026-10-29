'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PersonPicker from '@/components/PersonPicker'
import type { Profile, PeerData } from '@/lib/types'
import { PILLARS, PILLAR_COLORS, type PillarKey } from '@/lib/twg'
import clsx from 'clsx'

// A quick, informal observation a teacher gives a colleague. Deliberately a
// single screen — no pre-meeting, ratings, or sign-off. The row is private to
// the two teachers (see migration_peer_observations.sql).
export default function PeerObservationPage() {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [person, setPerson] = useState<Profile | null>(null)
  const [observedOn, setObservedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [focus, setFocus] = useState<PillarKey[]>([])
  const [context, setContext] = useState('')
  const [glow, setGlow] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [sendEmail, setSendEmail] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; email: 'sent' | 'skipped' | 'failed' | 'off' } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }
      setUserId(user.id)
      const { data: profs } = await supabase.from('profiles').select('*').order('first_name')
      setProfiles((profs ?? []) as Profile[])
      setReady(true)
    }
    load()
  }, [])

  const toggleFocus = (k: PillarKey) =>
    setFocus((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  const reset = () => {
    setPerson(null); setFocus([]); setContext(''); setGlow(''); setSuggestion('')
    setObservedOn(new Date().toISOString().slice(0, 10)); setSendEmail(true)
    setError(null); setDone(null)
  }

  const share = useCallback(async () => {
    if (!person) { setError('Choose the colleague you observed.'); return }
    if (!glow.trim()) { setError('Add a note about what stood out before sharing.'); return }
    setSaving(true); setError(null)

    const peer_data: PeerData = {
      focus,
      glow: glow.trim(),
      suggestion: suggestion.trim(),
      context: context.trim(),
    }
    const row = {
      observer_id: userId,
      observed_id: person.id,
      framework_id: null,
      obs_type: 'informal' as const,
      // Noon local avoids the date slipping a day across timezones.
      observed_at: new Date(`${observedOn}T12:00:00`).toISOString(),
      notes: glow.trim(),
      status: 'published' as const,
      is_peer: true,
      peer_data,
    }

    try {
      const { data, error: e } = await supabase.from('observations').insert(row).select('id').single()
      if (e) throw e
      const id = (data as { id: string }).id

      let emailState: 'sent' | 'skipped' | 'failed' | 'off' = 'off'
      if (sendEmail) {
        try {
          const res = await fetch('/api/observations/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
          })
          const body = await res.json().catch(() => ({}))
          emailState = body.email === 'sent' ? 'sent' : body.email === 'skipped' ? 'skipped' : 'failed'
        } catch {
          emailState = 'failed'
        }
      }
      setDone({ name: person.first_name, email: emailState })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not share this feedback.')
    } finally {
      setSaving(false)
    }
  }, [person, glow, suggestion, context, focus, observedOn, sendEmail, userId])

  if (!ready) {
    return <div className="max-w-2xl mx-auto"><div className="card h-64 animate-pulse bg-gray-100" /></div>
  }

  if (done) {
    const emailLine =
      done.email === 'sent' ? `${done.name} has been emailed a note that you shared feedback.`
      : done.email === 'skipped' ? `Shared in the app. Email is off for now, so ${done.name} wasn’t emailed — they’ll see it in their Observations.`
      : done.email === 'failed' ? `Shared in the app, but the email didn’t send. ${done.name} can still see it in their Observations.`
      : `${done.name} will see it in their Observations.`
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 text-green-700 grid place-items-center text-2xl">✓</div>
          <div>
            <h2 className="text-xl font-display text-gray-900">Feedback shared with {done.name}</h2>
            <p className="text-gray-500 mt-1">{emailLine}</p>
          </div>
          <p className="text-xs text-gray-400">
            Peer feedback stays between the two of you — it isn’t shared with supervisors or admins.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button onClick={reset} className="btn-primary">Give more feedback</button>
            <Link href="/dashboard/observations" className="btn-secondary">Back to Observations</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/observations" className="text-sm text-gray-500 hover:text-gray-700">← Observations</Link>
        <h1 className="text-2xl font-display text-gray-900 mt-2">Quick peer feedback</h1>
        <p className="text-gray-500 mt-1">
          A short, collegial note for a colleague after dropping into their class.
          It stays between the two of you.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Colleague you observed <span className="text-red-500">*</span></label>
            <PersonPicker
              profiles={profiles}
              exclude={userId ? [userId] : []}
              value={person}
              onChange={setPerson}
              placeholder="Search by name or title…"
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={observedOn}
              onChange={(e) => setObservedOn(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Focus <span className="text-gray-400 font-normal">(optional)</span></label>
          <p className="text-xs text-gray-400 mb-2">Which Teaching with Grace pillar(s) did your feedback touch?</p>
          <div className="flex flex-wrap gap-2">
            {PILLARS.map((p) => {
              const on = focus.includes(p.key)
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => toggleFocus(p.key)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm font-medium border transition-colors',
                    on ? 'text-white' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                  style={on ? { backgroundColor: PILLAR_COLORS[p.key], borderColor: PILLAR_COLORS[p.key] } : undefined}
                  title={p.focus}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="label">What was happening? <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            className="input"
            placeholder="e.g. 7th grade math — small-group problem solving"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        <div>
          <label className="label">What stood out <span className="text-red-500">*</span></label>
          <textarea
            rows={4}
            className="input resize-none"
            placeholder="A strength you noticed — something that worked well for students…"
            value={glow}
            onChange={(e) => setGlow(e.target.value)}
          />
        </div>

        <div>
          <label className="label">A wondering or suggestion <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            rows={3}
            className="input resize-none"
            placeholder="Something you’re curious about, or a friendly idea to try…"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          <span className="text-sm text-gray-600">
            Also email {person ? person.first_name : 'them'} a note that you shared feedback.
            {' '}It’s posted to their Observations either way.
          </span>
        </label>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <Link href="/dashboard/observations" className="btn-secondary sm:flex-1 text-center">Cancel</Link>
          <button onClick={share} disabled={saving} className="btn-primary sm:flex-1">
            {saving ? 'Sharing…' : 'Share feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}
