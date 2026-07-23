'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Resource } from '@/lib/types'
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from '@/lib/taxonomy'
import { termsFor, type TaxonomyTerm } from '@/lib/taxonomyDb'
import clsx from 'clsx'
import Link from 'next/link'

const themePillStyle = { backgroundColor: '#FBEAF0', color: '#993556' }

function typeLabel(type: string) {
  return RESOURCE_TYPE_LABELS[type] ?? type
}

function ResourceCard({
  resource,
  isFav,
  onToggleFav,
  canManage,
  onDelete,
}: {
  resource: Resource
  isFav: boolean
  onToggleFav: (id: string, current: boolean) => void
  canManage: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="card p-0 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Cover image */}
      <div className="relative h-44 w-full bg-navy-900">
        {resource.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.cover_image}
            alt={resource.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center">
            <span className="text-white/90 font-display text-lg tracking-wide">
              {typeLabel(resource.type)}
            </span>
          </div>
        )}

        {/* Type badge overlay (top-left) */}
        <span className="absolute top-2 left-2 bg-navy-900/90 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
          {typeLabel(resource.type)}
        </span>

        {/* Favorite button overlay (top-right) */}
        <button
          onClick={() => onToggleFav(resource.id, isFav)}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-base shadow-sm transition-transform hover:scale-110"
        >
          {isFav ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{resource.title}</h3>
          {resource.description && (
            <p className="text-gray-500 text-xs mt-1 line-clamp-2">{resource.description}</p>
          )}
        </div>

        {/* Audience */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Audience</p>
          {resource.audience.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {resource.audience.map((a) => (
                <span key={a} className="badge badge-navy text-[10px]">{a}</span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">–</span>
          )}
        </div>

        {/* Themes */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Themes</p>
          {resource.themes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {resource.themes.map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={themePillStyle}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">–</span>
          )}
        </div>

        {/* Subjects */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Subjects</p>
          {resource.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {resource.subjects.map((s) => (
                <span key={s} className="badge badge-gray text-[10px]">{s}</span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">–</span>
          )}
        </div>

        {/* Footer row */}
        <div className="mt-auto pt-1 flex items-center justify-between gap-2">
          {resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-800 text-xs font-semibold hover:text-navy-900"
            >
              Open resource →
            </a>
          ) : (
            <span />
          )}

          {canManage && (
            <div className="flex items-center gap-3">
              <Link
                href={`/dashboard/resources/submit?edit=${resource.id}`}
                className="text-xs font-semibold text-gray-500 hover:text-navy-900"
              >
                Edit
              </Link>
              <button
                onClick={() => onDelete(resource.id)}
                className="text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MultiChips({
  label,
  options,
  selected,
  onToggle,
  labelFor,
}: {
  label: string
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
  labelFor?: (value: string) => string
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                active
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'border-gray-300 text-gray-600 hover:border-navy-400'
              )}
            >
              {labelFor ? labelFor(opt) : opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ResourcesPage() {
  const supabase = createClient()
  const [resources, setResources] = useState<Resource[]>([])
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [audienceFilter, setAudienceFilter] = useState<string[]>([])
  const [subjectFilter, setSubjectFilter] = useState<string[]>([])
  const [themeFilter, setThemeFilter] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [taxTerms, setTaxTerms] = useState<TaxonomyTerm[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: res }, { data: favs }, { data: tax }, { data: profile }] = await Promise.all([
      supabase
        .from('resources')
        .select('*')
        .eq('is_approved', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('resource_favorites')
        .select('resource_id')
        .eq('user_id', user.id),
      supabase
        .from('taxonomy_terms')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    setResources((res ?? []) as Resource[])
    setFavIds(new Set((favs ?? []).map((f) => f.resource_id)))
    setTaxTerms((tax ?? []) as TaxonomyTerm[])
    setUserRole((profile as unknown as { role: string } | null)?.role ?? null)
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
      setFavIds((prev) => {
        const next = new Set(prev)
        next.add(resourceId)
        return next
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this resource? This cannot be undone.')) return
    setPageError(null)

    const { data, error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      setPageError(error.message)
      return
    }
    if (!data || data.length === 0) {
      setPageError("You don't have permission to delete this resource.")
      return
    }

    setResources((prev) => prev.filter((r) => r.id !== id))
    setFavIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  const clearFilters = () => {
    setTypeFilter([])
    setAudienceFilter([])
    setSubjectFilter([])
    setThemeFilter([])
  }

  const activeFilterCount =
    typeFilter.length + audienceFilter.length + subjectFilter.length + themeFilter.length

  const hasAny = (values: string[], selected: string[]) =>
    selected.length === 0 || selected.some((s) => values.includes(s))

  const filtered = resources.filter((r) => {
    const matchSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter.length === 0 || typeFilter.includes(r.type)
    const matchAudience = hasAny(r.audience, audienceFilter)
    const matchSubject = hasAny(r.subjects, subjectFilter)
    const matchTheme = hasAny(r.themes, themeFilter)
    return matchSearch && matchType && matchAudience && matchSubject && matchTheme
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {pageError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {pageError}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search resources…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={clsx('btn-secondary shrink-0', activeFilterCount > 0 && 'ring-1 ring-navy-300')}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        <Link href="/dashboard/resources/submit" className="btn-primary shrink-0">
          + Submit Resource
        </Link>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card p-5 space-y-4">
          <MultiChips
            label="Type"
            options={RESOURCE_TYPES}
            selected={typeFilter}
            onToggle={toggle(setTypeFilter)}
            labelFor={(t) => RESOURCE_TYPE_LABELS[t] ?? t}
          />
          <MultiChips label="Audience" options={termsFor(taxTerms, 'audience')} selected={audienceFilter} onToggle={toggle(setAudienceFilter)} />
          <MultiChips label="Subject" options={termsFor(taxTerms, 'subject')} selected={subjectFilter} onToggle={toggle(setSubjectFilter)} />
          <MultiChips label="Theme" options={termsFor(taxTerms, 'theme')} selected={themeFilter} onToggle={toggle(setThemeFilter)} />
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="btn-ghost text-xs">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-0 h-80 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No resources found.</p>
          <p className="text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              isFav={favIds.has(r.id)}
              onToggleFav={toggleFav}
              canManage={(userId !== null && r.submitted_by === userId) || userRole === 'admin'}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
