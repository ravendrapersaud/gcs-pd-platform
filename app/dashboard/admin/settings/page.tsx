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

export default function AdminSettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Form state
  const [allotment, setAllotment] = useState(String(FALLBACK_FUND_CONFIG.defaultAllotment))
  const [staffStart, setStaffStart] = useState(FALLBACK_FUND_CONFIG.staffYearStart)
  const [facultyStart, setFacultyStart] = useState(FALLBACK_FUND_CONFIG.facultyYearStart)

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

    const rows = [
      { key: 'default_pd_allotment', value: String(amount), updated_by: userId, updated_at: new Date().toISOString() },
      { key: 'staff_fund_year_start', value: mmdd(staffStart), updated_by: userId, updated_at: new Date().toISOString() },
      { key: 'faculty_fund_year_start', value: mmdd(facultyStart), updated_by: userId, updated_at: new Date().toISOString() },
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
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">PD fund policy</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Controls the annual PD fund amount and when each group&apos;s fund year resets.
          </p>
        </div>

        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {saveError}
          </div>
        )}
        {saved && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Saved. Fund calculations across the platform now use these settings.
          </div>
        )}

        <div>
          <label className="label">Default annual allotment ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={allotment}
            onChange={(e) => { setAllotment(e.target.value); setSaved(false) }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Individuals can be given a different amount from their profile in the Staff Roster.
          </p>
        </div>

        <DateField
          label="Staff fund year starts"
          month={staffStart.month}
          day={staffStart.day}
          onChange={(month, day) => { setStaffStart({ month, day }); setSaved(false) }}
          preview={`Current staff fund year: ${fmtDate(staffRange.start)} – ${fmtDate(inclusiveEnd(staffRange.end))}`}
        />

        <DateField
          label="Faculty fund year starts"
          month={facultyStart.month}
          day={facultyStart.day}
          onChange={(month, day) => { setFacultyStart({ month, day }); setSaved(false) }}
          preview={`Current faculty fund year: ${fmtDate(facultyRange.start)} – ${fmtDate(inclusiveEnd(facultyRange.end))}`}
        />

        <div className="pt-1">
          <p className="text-sm text-gray-600">
            Effective allotment preview: {formatUSD(previewCfg.defaultAllotment)} per person per fund year.
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
