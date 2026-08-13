'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseFundSettings } from '@/lib/funds'
import { pdHoursTarget } from '@/lib/appSettings'
import { EMPLOYEE_TYPES } from '@/lib/taxonomy'
import clsx from 'clsx'
import {
  SUBJECTS, CANNED_REPORTS, recordsFor, runReport, subjectFields,
  displayValue, cellValue,
  type ReportSubject, type ReportFilters, type ReportSpec, type RawData, type ReportRow,
} from '@/lib/reports'

const PREVIEW_LIMIT = 50

export default function ReportBuilder() {
  const supabase = createClient()
  const [raw, setRaw] = useState<RawData | null>(null)
  const [cfg, setCfg] = useState(parseFundSettings(null))
  const [target, setTarget] = useState(0)
  const [loading, setLoading] = useState(true)

  // Report spec
  const [subject, setSubject] = useState<ReportSubject>('people')
  const [columns, setColumns] = useState<string[]>(SUBJECTS[0].defaultColumns)
  const [filters, setFilters] = useState<ReportFilters>({})
  const [groupBy, setGroupBy] = useState<string>('')
  const [activeCanned, setActiveCanned] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [
        { data: profiles }, { data: activities }, { data: funding },
        { data: observations }, { data: goals }, { data: assignments },
        { data: spotlights }, { data: settings },
      ] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, email, title, division, department, employee_type, role, employee_id, pd_allotment, needs_setup'),
        supabase.from('pd_activities').select('user_id, title, type, activity_date, hours, verified, notes'),
        supabase.from('funding_requests').select('user_id, title, amount, status, is_overseas_travel, decision_note, reviewed_by, reviewed_at, created_at'),
        supabase.from('observations').select('observed_id'),
        supabase.from('goals').select('owner_id'),
        supabase.from('supervisor_assignments').select('staff_id, is_primary, supervisor:profiles!supervisor_assignments_supervisor_id_fkey(first_name, last_name)'),
        supabase.from('spotlights').select('to_user_id'),
        supabase.from('app_settings').select('key, value'),
      ])
      setCfg(parseFundSettings(settings))
      setTarget(pdHoursTarget(settings))
      setRaw({
        profiles: (profiles ?? []) as unknown as RawData['profiles'],
        activities: (activities ?? []) as unknown as RawData['activities'],
        funding: (funding ?? []) as unknown as RawData['funding'],
        observations: (observations ?? []) as RawData['observations'],
        goals: (goals ?? []) as RawData['goals'],
        assignments: (assignments ?? []) as unknown as RawData['assignments'],
        spotlights: (spotlights ?? []) as RawData['spotlights'],
      })
      setLoading(false)
    }
    load()
  }, [])

  // Records for the current subject (memoized per subject / data change).
  const records: ReportRow[] = useMemo(
    () => (raw ? recordsFor(subject, raw, cfg, target) : []),
    [raw, subject, cfg, target]
  )

  const spec: ReportSpec = useMemo(
    () => ({ subject, columns, filters, groupBy: groupBy || undefined }),
    [subject, columns, filters, groupBy]
  )
  const result = useMemo(() => runReport(spec, records), [spec, records])

  // Filter option lists (from the raw profile/data values).
  const divisions = useMemo(
    () => Array.from(new Set((raw?.profiles ?? []).map((p) => p.division).filter(Boolean))).sort() as string[],
    [raw]
  )
  const departments = useMemo(
    () => Array.from(new Set((raw?.profiles ?? []).map((p) => p.department).filter(Boolean))).sort() as string[],
    [raw]
  )
  const statuses = useMemo(
    () => Array.from(new Set((raw?.funding ?? []).map((f) => f.status).filter(Boolean))).sort() as string[],
    [raw]
  )
  const pdTypes = useMemo(
    () => Array.from(new Set((raw?.activities ?? []).map((a) => a.type).filter(Boolean))).sort() as string[],
    [raw]
  )

  const chooseSubject = useCallback((s: ReportSubject) => {
    setSubject(s)
    setColumns(SUBJECTS.find((x) => x.id === s)?.defaultColumns ?? [])
    setFilters({})
    setGroupBy('')
    setActiveCanned(null)
  }, [])

  const runCanned = useCallback((id: string) => {
    const c = CANNED_REPORTS.find((r) => r.id === id)
    if (!c) return
    setSubject(c.subject)
    setColumns(c.columns)
    setFilters(c.filters ?? {})
    setGroupBy(c.groupBy ?? '')
    setActiveCanned(id)
  }, [])

  const toggleColumn = (key: string) => {
    setActiveCanned(null)
    setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]))
  }

  const patchFilter = (patch: Partial<ReportFilters>) => {
    setActiveCanned(null)
    setFilters((f) => ({ ...f, ...patch }))
  }

  // ── Export ─────────────────────────────────────────────────────
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  const baseName = () =>
    `gcs-${activeCanned ?? subject}-${new Date().toISOString().slice(0, 10)}`

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = result.columns.map((c) => esc(c.label)).join(',')
    const body = result.rows.map((row) =>
      row.map((v, i) => {
        const cell = cellValue(result.columns[i].type, v)
        return typeof cell === 'number' ? String(cell) : esc(cell)
      }).join(',')
    )
    download(new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }), `${baseName()}.csv`)
  }

  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const aoa = [
      result.columns.map((c) => c.label),
      ...result.rows.map((row) => row.map((v, i) => cellValue(result.columns[i].type, v))),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${baseName()}.xlsx`)
  }

  const fields = subjectFields(subject)
  const groups = Array.from(new Set(fields.map((f) => f.group)))
  const dimensionFields = fields.filter((f) => f.type === 'text')

  if (loading) return <div className="card h-64 animate-pulse bg-gray-100" />

  return (
    <div className="space-y-5">
      {/* Quick reports */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Quick reports</h2>
        <p className="text-sm text-gray-500 mb-4">One click loads a standard report below — tweak or export as-is.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CANNED_REPORTS.map((c) => (
            <button
              key={c.id}
              onClick={() => runCanned(c.id)}
              className={clsx(
                'text-left rounded-lg border p-3 transition-colors',
                activeCanned === c.id
                  ? 'border-navy-800 bg-navy-50'
                  : 'border-gray-200 hover:border-navy-300 hover:bg-gray-50'
              )}
            >
              <p className="font-medium text-sm text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Builder */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Build a report</h2>

        {/* Subject */}
        <div>
          <label className="label">Subject</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => chooseSubject(s.id)}
                className={clsx('tab', subject === s.id ? 'tab-active' : 'tab-inactive')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div>
          <label className="label">Filters</label>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={filters.division ?? ''} onChange={(e) => patchFilter({ division: e.target.value || undefined })}>
              <option value="">All divisions</option>
              {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="input w-auto" value={filters.department ?? ''} onChange={(e) => patchFilter({ department: e.target.value || undefined })}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="input w-auto" value={filters.employeeType ?? ''} onChange={(e) => patchFilter({ employeeType: e.target.value || undefined })}>
              <option value="">All employee types</option>
              {EMPLOYEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {subject === 'funding' && (
              <select className="input w-auto" value={filters.status ?? ''} onChange={(e) => patchFilter({ status: e.target.value || undefined })}>
                <option value="">All statuses</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {subject === 'activities' && (
              <select className="input w-auto" value={filters.type ?? ''} onChange={(e) => patchFilter({ type: e.target.value || undefined })}>
                <option value="">All types</option>
                {pdTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {(subject === 'activities' || subject === 'funding') && (
              <>
                <input type="date" className="input w-auto" value={filters.dateFrom ?? ''} onChange={(e) => patchFilter({ dateFrom: e.target.value || undefined })} title="From date" />
                <input type="date" className="input w-auto" value={filters.dateTo ?? ''} onChange={(e) => patchFilter({ dateTo: e.target.value || undefined })} title="To date" />
              </>
            )}
            {subject === 'activities' && (
              <label className="tab tab-inactive cursor-pointer flex items-center gap-1.5">
                <input type="checkbox" checked={!!filters.verifiedOnly} onChange={(e) => patchFilter({ verifiedOnly: e.target.checked || undefined })} />
                Verified only
              </label>
            )}
            {subject === 'people' && (
              <label className="tab tab-inactive cursor-pointer flex items-center gap-1.5">
                <input type="checkbox" checked={!!filters.gapsOnly} onChange={(e) => patchFilter({ gapsOnly: e.target.checked || undefined })} />
                Data gaps only
              </label>
            )}
          </div>
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label mb-0">Columns</label>
            <button
              className="text-xs text-navy-800 hover:underline"
              onClick={() => { setActiveCanned(null); setColumns(SUBJECTS.find((s) => s.id === subject)?.defaultColumns ?? []) }}
            >
              Reset to defaults
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {groups.map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">{g}</span>
                {fields.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggleColumn(f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Group by */}
        <div className="flex items-center gap-3">
          <label className="label mb-0 shrink-0">Group by</label>
          <select className="input w-56" value={groupBy} onChange={(e) => { setActiveCanned(null); setGroupBy(e.target.value) }}>
            <option value="">No grouping (one row each)</option>
            {dimensionFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {groupBy && <span className="text-xs text-gray-400">Numeric columns are totaled per group.</span>}
        </div>
      </div>

      {/* Preview + export */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
            {result.rows.length > PREVIEW_LIMIT && ` — showing first ${PREVIEW_LIMIT}`}
          </span>
          <div className="flex gap-2">
            <button onClick={exportCsv} disabled={result.columns.length === 0} className="btn-secondary text-sm">Export CSV</button>
            <button onClick={exportXlsx} disabled={result.columns.length === 0} className="btn-secondary text-sm">Export XLSX</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {result.columns.map((c) => (
                  <th key={c.key} className={clsx('px-3 py-2 font-semibold text-gray-600', c.type === 'number' || c.type === 'currency' ? 'text-right' : 'text-left')}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.rows.slice(0, PREVIEW_LIMIT).map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50">
                  {row.map((v, ci) => (
                    <td key={ci} className={clsx('px-3 py-2 text-gray-700', result.columns[ci].type === 'number' || result.columns[ci].type === 'currency' ? 'text-right tabular-nums' : 'text-left')}>
                      {displayValue(result.columns[ci].type, v)}
                    </td>
                  ))}
                </tr>
              ))}
              {result.columns.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-gray-400">Pick at least one column.</td></tr>
              )}
              {result.columns.length > 0 && result.rows.length === 0 && (
                <tr><td colSpan={result.columns.length} className="px-4 py-8 text-center text-gray-400">No rows match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
