'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Resource, ResourceType } from '@/lib/types'
import clsx from 'clsx'
import Link from 'next/link'

const RESOURCE_TYPES: ResourceType[] = [
  'webinar', 'certificate', 'conference', 'article', 'tool', 'book', 'video', 'other',
]

const typeIcon: Record<ResourceType, string> = {
  webinar: '🎥',
  certificate: '🏅',
  conference: '🎤',
  article: '📄',
  tool: '🛠',
  book: '📚',
  video: '▶️',
  other: '🔗',
}

function getDomain(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function ResourceCard({
  resource,
  isFav,
  onToggleFav,
}: {
  resource: Resource
  isFav: boolean
  onToggleFav: (id: string, current: boolean) => void
}) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{typeIcon[resource.type]}</span>
          <span className="badge badge-navy capitalize">{resource.type}</span>
        </div>
        <button
          onClick={() => onToggleFav(resource.id, isFav)}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          className="text-xl transition-transform hover:scale-110"
        >
          {isFav ? '❤️' : '🤍'}
        </button>
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{resource.title}</h3>
        {resource.description && (
          <p className="text-gray-500 text-xs mt-1 line-clamp-2">{resource.description}</p>
        )}
      </div>

      {getDomain(resource.url) && (
        <p className="text-xs text-gray-400">{getDomain(resource.url)}</p>
      )}

      {resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resource.tags.map((tag) => (
            <span key={tag} className="badge badge-gray text-[10px]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {resource.url && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs mt-auto"
        >
          Open resource →
        </a>
      )}
    </div>
  )
}

export default function ResourcesPage() {
  const supabase = createClient()
  const [resources, setResources] = useState<Resource[]>([])
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: res }, { data: favs }] = await Promise.all([
      supabase
        .from('resources')
        .select('*')
        .eq('is_approved', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('resource_favorites')
        .select('resource_id')
        .eq('user_id', user.id),
    ])

    const resources = (res ?? []) as Resource[]
    setResources(resources)
    setFavIds(new Set((favs ?? []).map((f) => f.resource_id)))

    // Collect all unique tags
    const tags = Array.from(new Set(resources.flatMap((r) => r.tags))).sort()
    setAllTags(tags)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleFav = async (resourceId: string, currentlyFav: boolean) => {
    if (!userId) return

    if (currentlyFav) {
      await supabase
        .from('resource_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('resource_id', resourceId)
      setFavIds((prev) => {
        const next = new Set(prev)
        next.delete(resourceId)
        return next
      })
    } else {
      await supabase
        .from('resource_favorites')
        .insert({ user_id: userId, resource_id: resourceId })
      setFavIds((prev) => new Set([...prev, resourceId]))
    }
  }

  const filtered = resources.filter((r) => {
    const matchSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || r.type === typeFilter
    const matchTag = !tagFilter || r.tags.includes(tagFilter)
    return matchSearch && matchType && matchTag
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search resources…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
        <Link href="/dashboard/resources/submit" className="btn-primary shrink-0">
          + Submit Resource
        </Link>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter('all')}
          className={clsx('tab', typeFilter === 'all' ? 'tab-active' : 'tab-inactive')}
        >
          All
        </button>
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t === typeFilter ? 'all' : t)}
            className={clsx('tab capitalize', typeFilter === t ? 'tab-active' : 'tab-inactive')}
          >
            {typeIcon[t]} {t}
          </button>
        ))}
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                tagFilter === tag
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'border-gray-300 text-gray-600 hover:border-navy-400'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 h-40 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No resources found.</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              isFav={favIds.has(r.id)}
              onToggleFav={toggleFav}
            />
          ))}
        </div>
      )}
    </div>
  )
}
