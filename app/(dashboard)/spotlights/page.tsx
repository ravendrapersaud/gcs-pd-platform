'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Spotlight, Profile } from '@/lib/types'

const SPOTLIGHT_TAGS = [
  'Innovation', 'Student-Centered Learning', 'Collaboration', 'Leadership',
  'Technology Integration', 'Inclusion & Equity', 'Growth Mindset', 'Community',
  'Mentorship', 'Above & Beyond',
]

function SpotlightCard({ spotlight }: { spotlight: Spotlight }) {
  const from = spotlight.from_user
  const to = spotlight.to_user

  return (
    <div className="card p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-xl shrink-0">
            ⭐
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {to ? `${to.first_name} ${to.last_name}` : 'Someone'}
            </p>
            <p className="text-xs text-gray-400">
              {to?.title || ''}
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {new Date(spotlight.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </div>

      <blockquote className="bg-yellow-50 border-l-4 border-yellow-300 rounded-r-lg px-4 py-3 text-sm text-gray-700 italic leading-relaxed">
        &ldquo;{spotlight.message}&rdquo;
      </blockquote>

      {spotlight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {spotlight.tags.map((tag) => (
            <span key={tag} className="badge badge-navy text-xs">{tag}</span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        From: {from ? `${from.first_name} ${from.last_name}` : 'A colleague'}
      </p>
    </div>
  )
}

function SpotlightForm({
  profiles,
  onSuccess,
}: {
  profiles: Profile[]
  onSuccess: () => void
}) {
  const [recipientSearch, setRecipientSearch] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState<Profile | null>(null)
  const [message, setMessage] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredProfiles = profiles.filter(
    (p) =>
      !selectedRecipient &&
      recipientSearch &&
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(recipientSearch.toLowerCase())
  )

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRecipient || !message.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/spotlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_user_id: selectedRecipient.id,
          message: message.trim(),
          tags: selectedTags,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send spotlight')
      }
      setRecipientSearch('')
      setSelectedRecipient(null)
      setMessage('')
      setSelectedTags([])
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-bold text-gray-900 text-lg mb-5">✨ Send a Spotlight</h2>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Recipient search */}
        <div className="relative">
          <label className="label">Spotlight who?</label>
          {selectedRecipient ? (
            <div className="flex items-center gap-2 p-3 border border-navy-300 rounded-lg bg-navy-50">
              <span className="font-medium text-navy-900">
                {selectedRecipient.first_name} {selectedRecipient.last_name}
              </span>
              <span className="text-xs text-navy-500">{selectedRecipient.title}</span>
              <button
                type="button"
                onClick={() => { setSelectedRecipient(null); setRecipientSearch('') }}
                className="ml-auto text-navy-400 hover:text-navy-700 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ) : (
            <input
              ref={inputRef}
              className="input"
              placeholder="Search by name…"
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
            />
          )}
          {filteredProfiles.length > 0 && (
            <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {filteredProfiles.map((p) => (
                <li
                  key={p.id}
                  className="px-4 py-2.5 text-sm cursor-pointer hover:bg-navy-50 flex items-center gap-2"
                  onClick={() => {
                    setSelectedRecipient(p)
                    setRecipientSearch('')
                  }}
                >
                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                  <span className="text-gray-400 text-xs">{p.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Message */}
        <div>
          <label className="label">Your spotlight message</label>
          <textarea
            required
            rows={4}
            className="input resize-none"
            placeholder="Describe what makes this person's work exceptional…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="label">Tags (select all that apply)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {SPOTLIGHT_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'border-gray-300 text-gray-600 hover:border-navy-400'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedRecipient || !message.trim()}
          className="btn-primary w-full"
        >
          {submitting ? 'Sending…' : '⭐ Send Spotlight'}
        </button>
      </form>
    </div>
  )
}

export default function SpotlightsPage() {
  const supabase = createClient()
  const [spotlights, setSpotlights] = useState<Spotlight[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: spots }, { data: profs }] = await Promise.all([
      supabase
        .from('spotlights')
        .select(`
          *,
          from_user:profiles!spotlights_from_user_id_fkey(id, first_name, last_name, title, avatar_url),
          to_user:profiles!spotlights_to_user_id_fkey(id, first_name, last_name, title, avatar_url)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('first_name'),
    ])
    setSpotlights((spots ?? []) as unknown as Spotlight[])
    setProfiles((profs ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <SpotlightForm profiles={profiles} onSuccess={load} />

      <div>
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-4">
          Recent Spotlights
        </h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-32 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : spotlights.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No spotlights yet — be the first to recognize a colleague!
          </div>
        ) : (
          <div className="space-y-4">
            {spotlights.map((s) => (
              <SpotlightCard key={s.id} spotlight={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
