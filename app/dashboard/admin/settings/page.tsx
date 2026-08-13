'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FALLBACK_FUND_CONFIG,
  parseFundSettings,
  fundYearRange,
  formatUSD,
  type FundConfig,
} from '@/lib/funds'
import {
  DEFAULT_PD_HOURS_TARGET,
  settingsMap,
} from '@/lib/appSettings'
import type { TaxonomyTerm, TaxonomyCategory } from '@/lib/taxonomyDb'
import clsx from 'clsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// End of a [start, end) range, shown inclusively (day before next start).
const inclusiveEnd = (end: Date) => new Date(end.getTime() - 24 * 60 * 60 * 1000)

interface DateFieldProps {
  label: string
  month: number // 0-indexed
  day: number
  onChange: (month: number, day: number) => void
  preview: string
}

function DateField({ label, month, day, onChange, preview }: DateFieldProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-3">
        <select
          className="input flex-1"
          value={month}
          onChange={(e) => onChange(Number(e.target.value), day)}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <select
          className="input w-24"
          value={day}
          onChange={(e) => onChange(month, Number(e.target.value))}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-400 mt-1">{preview}</p>
    </div>
  )
}

// ── Tags & taxonomy management ─────────────────────────────────────
const TAXONOMY_TABS: { key: TaxonomyCategory; label: string }[] = [
  { key: 'audience', label: 'Audiences' },
  { key: 'subject', label: 'Subjects' },
  { key: 'theme', label: 'Themes' },
]

function TaxonomySection() {
  const supabase = createClient()
  const [terms, setTerms] = useState<TaxonomyTerm[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<TaxonomyCategory>('audience')
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('taxonomy_terms')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })
    if (err) {
      setError(`Could not load taxonomy terms: ${err.message}. Make sure migration_taxonomy.sql has been applied.`)
    } else {
      setTerms((data ?? []) as TaxonomyTerm[])
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const catTerms = terms
    .filter((t) => t.category === category)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))

  // Runs a mutation, surfaces errors as a red banner, refetches after.
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true)
    setError(null)
    const { error: err } = await fn()
    if (err) setError(err.message)
    await load()
    setBusy(false)
  }

  const addTerm = async () => {
    const label = newLabel.trim()
    if (!label) return
    const nextOrder = catTerms.length > 0 ? Math.max(...catTerms.map((t) => t.sort_order)) + 1 : 0
    await run(() =>
      supabase.from('taxonomy_terms').insert({ category, label, sort_order: nextOrder })
    )
    setNewLabel('')
  }

  const saveRename = async (term: TaxonomyTerm) => {
    const label = editLabel.trim()
    setEditingId(null)
    if (!label || label === term.label) return
    await run(() => supabase.from('taxonomy_terms').update({ label }).eq('id', term.id))
  }

  const toggleActive = (term: TaxonomyTerm) =>
    run(() =>
      supabase.from('taxonomy_terms').update({ is_active: !term.is_active }).eq('id', term.id)
    )

  // Swaps sort_order with the neighbor above/below in the current list.
  const move = async (index: number, dir: -1 | 1) => {
    const a = catTerms[index]
    const b = catTerms[index + dir]
    if (!a || !b) return
    // If sort orders collide (legacy data), fall back to index positions.
    const aOrder = a.sort_order === b.sort_order ? index + dir : b.sort_order
    const bOrder = a.sort_order === b.sort_order ? index : a.sort_order
    setBusy(true)
    setError(null)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('taxonomy_terms').update({ sort_order: aOrder }).eq('id', a.id),
      supabase.from('taxonomy_terms').update({ sort_order: bOrder }).eq('id', b.id),
    ])
    const err = e1 ?? e2
    if (err) setError(err.message)
    await load()
    setBusy(false)
  }

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900 text-lg">Tags &amp; taxonomy</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          The audience, subject, and theme tags used across the resource library and PD calendar.
        </p>
      </div>

      <div className="p-3 bg-navy-50 border border-navy-200 rounded-lg text-navy-900 text-xs">
        Renaming or retiring a term affects new tagging only; existing items keep their current tags.
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {TAXONOMY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setCategory(t.key); setEditingId(null); setNewLabel('') }}
            className={clsx('tab', category === t.key ? 'tab-active' : 'tab-inactive')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="h-32 animate-pulse bg-gray-100 rounded-lg" />
      ) : catTerms.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">
          No terms yet in this category — add one below. (Until terms exist here, pages fall back
          to the built-in defaults.)
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {catTerms.map((term, i) => (
            <li
              key={term.id}
              className={clsx(
                'flex items-center gap-2 px-3 py-2',
                !term.is_active && 'opacity-50 bg-gray-50'
              )}
            >
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  aria-label={`Move ${term.label} up`}
                  className="text-gray-400 hover:text-navy-800 disabled:opacity-30 text-xs leading-none px-1"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={busy || i === catTerms.length - 1}
                  aria-label={`Move ${term.label} down`}
                  className="text-gray-400 hover:text-navy-800 disabled:opacity-30 text-xs leading-none px-1"
                >
                  ▼
                </button>
              </div>

              {editingId === term.id ? (
                <input
                  className="input flex-1 py-1 text-sm"
                  value={editLabel}
                  autoFocus
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(term)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className="flex-1 text-sm text-gray-800 min-w-0 truncate">{term.label}</span>
              )}

              {!term.is_active && <span className="badge badge-gray text-[10px] shrink-0">retired</span>}

              {editingId === term.id ? (
                <>
                  <button
                    onClick={() => saveRename(term)}
                    disabled={busy}
                    className="text-xs font-medium text-navy-800 hover:underline shrink-0"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs font-medium text-gray-500 hover:underline shrink-0"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditingId(term.id); setEditLabel(term.label) }}
                    disabled={busy}
                    className="text-xs font-medium text-navy-800 hover:underline shrink-0"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => toggleActive(term)}
                    disabled={busy}
                    className={clsx(
                      'text-xs font-medium hover:underline shrink-0',
                      term.is_active ? 'text-red-600' : 'text-green-700'
                    )}
                  >
                    {term.is_active ? 'Retire' : 'Restore'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={`New ${category} term…`}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTerm() }}
        />
        <button onClick={addTerm} disabled={busy || !newLabel.trim()} className="btn-secondary shrink-0">
          + Add term
        </button>
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Form state — fund policy
  const [allotment, setAllotment] = useState(String(FALLBACK_FUND_CONFIG.defaultAllotment))
  const [staffStart, setStaffStart] = useState(FALLBACK_FUND_CONFIG.staffYearStart)
  const [facultyStart, setFacultyStart] = useState(FALLBACK_FUND_CONFIG.facultyYearStart)

  // Form state — other platform settings
  const [hoursTarget, setHoursTarget] = useState(String(DEFAULT_PD_HOURS_TARGET))
  const [threshold, setThreshold] = useState('')
  const [allowOverBalance, setAllowOverBalance] = useState(true)
  const [moderation, setModeration] = useState(false)
  const [wsPolicy, setWsPolicy] = useState<'supervisors' | 'everyone'>('supervisors')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setUserId(user.id)

    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('app_settings').select('key, value'),
    ])
    setRole(profile?.role ?? 'staff')

    const cfg = parseFundSettings(settings)
    setAllotment(String(cfg.defaultAllotment))
    setStaffStart(cfg.staffYearStart)
    setFacultyStart(cfg.facultyYearStart)

    const map = settingsMap(settings)
    const target = Number(map['pd_hours_target'])
    setHoursTarget(String(Number.isFinite(target) && target > 0 ? target : DEFAULT_PD_HOURS_TARGET))
    setThreshold((map['funding_admin_threshold'] ?? '').trim())
    setAllowOverBalance((map['allow_over_balance_requests'] ?? 'true') !== 'false')
    setModeration((map['resource_moderation'] ?? 'off') === 'on')
    setWsPolicy(map['workspace_creation_policy'] === 'everyone' ? 'everyone' : 'supervisors')

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  // Live preview config built from the current form values.
  const previewCfg: FundConfig = {
    defaultAllotment: Number(allotment) || FALLBACK_FUND_CONFIG.defaultAllotment,
    staffYearStart: staffStart,
    facultyYearStart: facultyStart,
  }
  const staffRange = fundYearRange('staff', previewCfg)
  const facultyRange = fundYearRange('faculty', previewCfg)

  const mmdd = (v: { month: number; day: number }) =>
    `${String(v.month + 1).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`

  const touch = () => setSaved(false)

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaved(false)

    const amount = Number(allotment)
    if (!Number.isFinite(amount) || amount <= 0) {
      setSaveError('Default annual allotment must be a positive number.')
      setSaving(false)
      return
    }

    const target = Number(hoursTarget)
    if (!Number.isFinite(target) || target <= 0) {
      setSaveError('Annual PD hours target must be a positive number.')
      setSaving(false)
      return
    }

    const thresholdRaw = threshold.trim()
    if (thresholdRaw !== '') {
      const t = Number(thresholdRaw)
      if (!Number.isFinite(t) || t <= 0) {
        setSaveError('Admin approval threshold must be a positive number, or blank to disable.')
        setSaving(false)
        return
      }
    }

    const now = new Date().toISOString()
    const rows = [
      { key: 'default_pd_allotment', value: String(amount), updated_by: userId, updated_at: now },
      { key: 'staff_fund_year_start', value: mmdd(staffStart), updated_by: userId, updated_at: now },
      { key: 'faculty_fund_year_start', value: mmdd(facultyStart), updated_by: userId, updated_at: now },
      { key: 'pd_hours_target', value: String(target), updated_by: userId, updated_at: now },
      { key: 'funding_admin_threshold', value: thresholdRaw === '' ? '' : String(Number(thresholdRaw)), updated_by: userId, updated_at: now },
      { key: 'allow_over_balance_requests', value: allowOverBalance ? 'true' : 'false', updated_by: userId, updated_at: now },
      { key: 'resource_moderation', value: moderation ? 'on' : 'off', updated_by: userId, updated_at: now },
      { key: 'workspace_creation_policy', value: wsPolicy, updated_by: userId, updated_at: now },
    ]

    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    if (error) {
      setSaveError(`Save failed: ${error.message}`)
    } else {
      setSaved(true)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card h-64 animate-pulse bg-gray-100" />
      </div>
    )
  }

  if (role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-10 text-center">
          <p className="text-gray-600 font-medium">Admins only</p>
          <p className="text-sm text-gray-400 mt-1">
            School-wide settings can only be changed by administrators.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Saved. Settings across the platform now use these values.
        </div>
      )}

      {/* ── PD fund policy ─────────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">PD fund policy</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Controls the annual PD fund amount and when each group&apos;s fund year resets.
          </p>
        </div>

        <div>
          <label className="label">Default annual allotment ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={allotment}
            onChange={(e) => { setAllotment(e.target.value); touch() }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Individuals can be given a different amount from their profile in the Roster.
          </p>
        </div>

        <DateField
          label="Staff fund year starts"
          month={staffStart.month}
          day={staffStart.day}
          onChange={(month, day) => { setStaffStart({ month, day }); touch() }}
          preview={`Current staff fund year: ${fmtDate(staffRange.start)} – ${fmtDate(inclusiveEnd(staffRange.end))}`}
        />

        <DateField
          label="Faculty fund year starts"
          month={facultyStart.month}
          day={facultyStart.day}
          onChange={(month, day) => { setFacultyStart({ month, day }); touch() }}
          preview={`Current faculty fund year: ${fmtDate(facultyRange.start)} – ${fmtDate(inclusiveEnd(facultyRange.end))}`}
        />

        <div className="pt-1">
          <p className="text-sm text-gray-600">
            Effective allotment preview: {formatUSD(previewCfg.defaultAllotment)} per person per fund year.
          </p>
        </div>
      </div>

      {/* ── PD hours ───────────────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">PD hours</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The annual professional development hours goal for faculty and staff.
          </p>
        </div>
        <div>
          <label className="label">Annual PD hours target</label>
          <input
            type="number"
            step="1"
            min="1"
            className="input"
            value={hoursTarget}
            onChange={(e) => { setHoursTarget(e.target.value); touch() }}
          />
          <p className="text-xs text-gray-400 mt-1">Shown as the goal on dashboards and reports.</p>
        </div>
      </div>

      {/* ── Funding rules ──────────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">Funding rules</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Guardrails for PD funding requests and approvals.
          </p>
        </div>
        <div>
          <label className="label">Requests above this amount require admin approval ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder="Leave blank to disable"
            value={threshold}
            onChange={(e) => { setThreshold(e.target.value); touch() }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Supervisors can&apos;t approve or deny requests over this amount — only admins can.
            Blank = no threshold.
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowOverBalance}
            onChange={(e) => { setAllowOverBalance(e.target.checked); touch() }}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-navy-900 focus:ring-navy-500"
          />
          <span>
            <span className="text-sm font-medium text-gray-700 block">
              Allow requests that exceed a person&apos;s remaining balance
            </span>
            <span className="text-xs text-gray-400">
              When off, the request form blocks amounts above the requester&apos;s remaining funds.
            </span>
          </span>
        </label>
      </div>

      {/* ── Resource library ───────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">Resource library</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Moderation for community-submitted resources.
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={moderation}
            onChange={(e) => { setModeration(e.target.checked); touch() }}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-navy-900 focus:ring-navy-500"
          />
          <span>
            <span className="text-sm font-medium text-gray-700 block">
              New resource submissions require admin approval
            </span>
            <span className="text-xs text-gray-400">
              Pending submissions appear under Funding Approvals → Resources (admins).
            </span>
          </span>
        </label>
      </div>

      {/* ── Workspaces ─────────────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">Workspaces</h2>
          <p className="text-sm text-gray-500 mt-0.5">Who can create workspaces?</p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="ws-policy"
              checked={wsPolicy === 'supervisors'}
              onChange={() => { setWsPolicy('supervisors'); touch() }}
              className="w-4 h-4 mt-0.5 border-gray-300 text-navy-900 focus:ring-navy-500"
            />
            <span className="text-sm text-gray-700">
              Supervisors and admins (plus individuals granted permission)
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="ws-policy"
              checked={wsPolicy === 'everyone'}
              onChange={() => { setWsPolicy('everyone'); touch() }}
              className="w-4 h-4 mt-0.5 border-gray-300 text-navy-900 focus:ring-navy-500"
            />
            <span className="text-sm text-gray-700">All faculty and staff</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* ── Tags & taxonomy (mutations apply immediately) ─────── */}
      <TaxonomySection />
    </div>
  )
}
