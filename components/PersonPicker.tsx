'use client'

import { useMemo, useState } from 'react'
import type { Profile } from '@/lib/types'

interface BaseProps {
  profiles: Profile[]
  placeholder?: string
  /** Profile ids to hide from the list (e.g. the current user). */
  exclude?: string[]
}

type SingleProps = BaseProps & {
  multiple?: false
  value: Profile | null
  onChange: (value: Profile | null) => void
}

type MultiProps = BaseProps & {
  multiple: true
  value: Profile[]
  onChange: (value: Profile[]) => void
}

export type PersonPickerProps = SingleProps | MultiProps

function Chip({ profile, onRemove }: { profile: Profile; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-navy-50 text-navy-900 border border-navy-200 rounded-full pl-2.5 pr-1 py-0.5 text-sm font-medium">
      {profile.first_name} {profile.last_name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${profile.first_name} ${profile.last_name}`}
        className="w-4 h-4 rounded-full hover:bg-navy-200 flex items-center justify-center text-navy-700 leading-none"
      >
        ×
      </button>
    </span>
  )
}

export default function PersonPicker(props: PersonPickerProps) {
  const { profiles, placeholder = 'Search by name…', exclude = [] } = props
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selectedIds = props.multiple
    ? props.value.map((p) => p.id)
    : props.value
      ? [props.value.id]
      : []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return profiles
      .filter((p) => !exclude.includes(p.id) && !selectedIds.includes(p.id))
      .filter(
        (p) =>
          !q ||
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          (p.title ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, query, exclude.join(','), selectedIds.join(',')])

  const handleSelect = (p: Profile) => {
    if (props.multiple) {
      props.onChange([...props.value, p])
    } else {
      props.onChange(p)
      setOpen(false)
    }
    setQuery('')
  }

  const showInput = props.multiple || !props.value

  return (
    <div className="relative">
      {/* Selected chips */}
      {props.multiple && props.value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {props.value.map((p) => (
            <Chip
              key={p.id}
              profile={p}
              onRemove={() => props.onChange(props.value.filter((v) => v.id !== p.id))}
            />
          ))}
        </div>
      )}

      {!props.multiple && props.value && (
        <div className="flex flex-wrap gap-1.5">
          <Chip profile={props.value} onRemove={() => props.onChange(null)} />
        </div>
      )}

      {showInput && (
        <input
          type="text"
          className="input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
      )}

      {showInput && open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full text-left px-4 py-2 text-sm hover:bg-navy-50 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(p)
                }}
              >
                <span className="font-medium text-gray-900">
                  {p.first_name} {p.last_name}
                </span>
                {p.title && <span className="text-gray-400 text-xs ml-2">{p.title}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
