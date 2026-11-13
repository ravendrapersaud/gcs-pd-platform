'use client'

import clsx from 'clsx'

// Shared toggle-chip multi-select: a row of pill buttons, filled navy when
// selected. Use anywhere a set of options is picked from — tags, report columns,
// targeting — instead of a dense checkbox grid. `labelFor` lets the stored value
// differ from the shown text.
export default function ChipGroup({
  options,
  selected,
  onToggle,
  labelFor,
  size = 'sm',
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
  labelFor?: (value: string) => string
  size?: 'sm' | 'xs'
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={active}
            className={clsx(
              'rounded-full border font-medium transition-colors',
              size === 'xs' ? 'px-2.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
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
  )
}
