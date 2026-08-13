// ── Reporting engine ─────────────────────────────────────────────
// One flexible engine over the core tables. A "canned report" is just a
// saved ReportSpec (subject + columns + filters + optional groupBy), so
// the standard reports and the custom builder share this code path.
//
// Pure module (no Supabase): the page fetches raw rows + fund settings
// and passes them in, mirroring lib/funds.ts / lib/appSettings.ts.

import {
  effectiveAllotment,
  isInFundYear,
  formatUSD,
  type FundConfig,
} from './funds'
import { roleAccessLabel } from './roles'

export type ReportSubject = 'people' | 'activities' | 'funding'
export type FieldType = 'text' | 'number' | 'currency' | 'date' | 'bool'

export interface FieldDef {
  key: string
  label: string
  group: string
  type: FieldType
}

export type ReportRow = Record<string, string | number | boolean | null>

export interface ReportFilters {
  division?: string
  department?: string
  employeeType?: string
  status?: string
  type?: string
  dateFrom?: string
  dateTo?: string
  verifiedOnly?: boolean
  gapsOnly?: boolean
}

export interface ReportSpec {
  subject: ReportSubject
  columns: string[]
  filters?: ReportFilters
  groupBy?: string
}

export interface CannedReport extends ReportSpec {
  id: string
  name: string
  description: string
}

// Raw table rows the engine consumes (loose shapes — the page casts).
export interface RawData {
  profiles: ProfileRow[]
  activities: ActivityRow[]
  funding: FundingRow[]
  observations: { observed_id: string }[]
  goals: { owner_id: string }[]
  assignments: AssignmentRow[]
  spotlights: { to_user_id: string }[]
}
interface ProfileRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  division: string | null
  department: string | null
  employee_type: string | null
  role: string
  employee_id: string | null
  pd_allotment: number | null
  needs_setup: boolean | null
}
interface ActivityRow {
  user_id: string
  title: string | null
  type: string | null
  activity_date: string | null
  hours: number | null
  verified: boolean | null
  notes: string | null
}
interface FundingRow {
  user_id: string
  title: string | null
  amount: number | null
  status: string | null
  is_overseas_travel: boolean | null
  decision_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string | null
}
interface AssignmentRow {
  staff_id: string
  is_primary: boolean
  supervisor: { first_name: string | null; last_name: string | null } | null
}

// ── Field registry ───────────────────────────────────────────────
export const SUBJECTS: {
  id: ReportSubject
  label: string
  fields: FieldDef[]
  defaultColumns: string[]
}[] = [
  {
    id: 'people',
    label: 'People',
    defaultColumns: [
      'last_name', 'first_name', 'division', 'department', 'employee_type',
      'pd_hours', 'hours_vs_target', 'approved_amount', 'balance_remaining',
    ],
    fields: [
      { key: 'first_name', label: 'First Name', group: 'Identity', type: 'text' },
      { key: 'last_name', label: 'Last Name', group: 'Identity', type: 'text' },
      { key: 'email', label: 'Email', group: 'Identity', type: 'text' },
      { key: 'title', label: 'Title', group: 'Identity', type: 'text' },
      { key: 'employee_id', label: 'Employee ID', group: 'Identity', type: 'text' },
      { key: 'division', label: 'Division', group: 'Organization', type: 'text' },
      { key: 'department', label: 'Department', group: 'Organization', type: 'text' },
      { key: 'employee_type', label: 'Employee Type', group: 'Organization', type: 'text' },
      { key: 'access', label: 'Access', group: 'Organization', type: 'text' },
      { key: 'primary_supervisor', label: 'Primary Supervisor', group: 'Organization', type: 'text' },
      { key: 'pd_hours', label: 'PD Hours (fund yr)', group: 'PD', type: 'number' },
      { key: 'pd_target', label: 'PD Target', group: 'PD', type: 'number' },
      { key: 'hours_vs_target', label: '% of Target', group: 'PD', type: 'number' },
      { key: 'activity_count', label: '# Activities', group: 'PD', type: 'number' },
      { key: 'last_activity_date', label: 'Last Activity', group: 'PD', type: 'date' },
      { key: 'allotment', label: 'Allotment', group: 'Funding', type: 'currency' },
      { key: 'approved_amount', label: 'Approved $ (fund yr)', group: 'Funding', type: 'currency' },
      { key: 'pending_amount', label: 'Pending $', group: 'Funding', type: 'currency' },
      { key: 'balance_remaining', label: 'Balance Remaining', group: 'Funding', type: 'currency' },
      { key: 'observation_count', label: '# Observations', group: 'Engagement', type: 'number' },
      { key: 'goal_count', label: '# Goals', group: 'Engagement', type: 'number' },
      { key: 'spotlights_received', label: 'Spotlights Received', group: 'Engagement', type: 'number' },
      { key: 'needs_setup', label: 'Needs Setup', group: 'Status', type: 'bool' },
    ],
  },
  {
    id: 'activities',
    label: 'PD Activities',
    defaultColumns: ['person', 'division', 'department', 'title', 'type', 'activity_date', 'hours', 'verified'],
    fields: [
      { key: 'person', label: 'Person', group: 'Person', type: 'text' },
      { key: 'division', label: 'Division', group: 'Person', type: 'text' },
      { key: 'department', label: 'Department', group: 'Person', type: 'text' },
      { key: 'employee_type', label: 'Employee Type', group: 'Person', type: 'text' },
      { key: 'title', label: 'Activity Title', group: 'Activity', type: 'text' },
      { key: 'type', label: 'Type', group: 'Activity', type: 'text' },
      { key: 'activity_date', label: 'Date', group: 'Activity', type: 'date' },
      { key: 'hours', label: 'Hours', group: 'Activity', type: 'number' },
      { key: 'verified', label: 'Verified', group: 'Activity', type: 'bool' },
      { key: 'notes', label: 'Notes', group: 'Activity', type: 'text' },
    ],
  },
  {
    id: 'funding',
    label: 'Funding Requests',
    defaultColumns: ['person', 'division', 'title', 'amount', 'status', 'created_at', 'reviewer'],
    fields: [
      { key: 'person', label: 'Person', group: 'Person', type: 'text' },
      { key: 'division', label: 'Division', group: 'Person', type: 'text' },
      { key: 'department', label: 'Department', group: 'Person', type: 'text' },
      { key: 'employee_type', label: 'Employee Type', group: 'Person', type: 'text' },
      { key: 'title', label: 'Request Title', group: 'Request', type: 'text' },
      { key: 'amount', label: 'Amount', group: 'Request', type: 'currency' },
      { key: 'status', label: 'Status', group: 'Request', type: 'text' },
      { key: 'is_overseas_travel', label: 'Overseas Travel', group: 'Request', type: 'bool' },
      { key: 'decision_note', label: 'Decision Note', group: 'Request', type: 'text' },
      { key: 'reviewer', label: 'Reviewed By', group: 'Request', type: 'text' },
      { key: 'reviewed_at', label: 'Reviewed At', group: 'Request', type: 'date' },
      { key: 'created_at', label: 'Submitted', group: 'Request', type: 'date' },
    ],
  },
]

export function subjectFields(subject: ReportSubject): FieldDef[] {
  return SUBJECTS.find((s) => s.id === subject)?.fields ?? []
}

// ── Record builders ──────────────────────────────────────────────
const name = (p: { first_name: string | null; last_name: string | null } | undefined | null) =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : ''

export function buildPeopleRecords(data: RawData, cfg: FundConfig, target: number): ReportRow[] {
  const primarySup: Record<string, string> = {}
  for (const a of data.assignments) {
    if (a.is_primary && a.supervisor) primarySup[a.staff_id] = name(a.supervisor)
  }
  const obsCount: Record<string, number> = {}
  for (const o of data.observations) obsCount[o.observed_id] = (obsCount[o.observed_id] ?? 0) + 1
  const goalCount: Record<string, number> = {}
  for (const g of data.goals) goalCount[g.owner_id] = (goalCount[g.owner_id] ?? 0) + 1
  const spotCount: Record<string, number> = {}
  for (const s of data.spotlights) spotCount[s.to_user_id] = (spotCount[s.to_user_id] ?? 0) + 1

  return data.profiles.map((p) => {
    const acts = data.activities.filter(
      (a) => a.user_id === p.id && a.activity_date && isInFundYear(a.activity_date, p.employee_type, cfg)
    )
    const hours = acts.reduce((s, a) => s + (Number(a.hours) || 0), 0)
    const lastActivity = acts.reduce<string | null>(
      (max, a) => (a.activity_date && (!max || a.activity_date > max) ? a.activity_date : max),
      null
    )
    const fund = data.funding.filter((f) => f.user_id === p.id)
    const approved = fund
      .filter((f) => f.status === 'approved' && f.created_at && isInFundYear(f.created_at, p.employee_type, cfg))
      .reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const pending = fund
      .filter((f) => f.status === 'pending')
      .reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const allotment = effectiveAllotment(p, cfg)
    const supervisor = primarySup[p.id] ?? ''

    return {
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      email: p.email ?? '',
      title: p.title ?? '',
      employee_id: p.employee_id ?? '',
      division: p.division ?? '',
      department: p.department ?? '',
      employee_type: p.employee_type ?? '',
      access: roleAccessLabel(p.role),
      primary_supervisor: supervisor,
      pd_hours: Math.round(hours * 10) / 10,
      pd_target: target,
      hours_vs_target: target > 0 ? Math.round((hours / target) * 100) : 0,
      activity_count: acts.length,
      last_activity_date: lastActivity,
      allotment,
      approved_amount: approved,
      pending_amount: pending,
      balance_remaining: allotment - approved,
      observation_count: obsCount[p.id] ?? 0,
      goal_count: goalCount[p.id] ?? 0,
      spotlights_received: spotCount[p.id] ?? 0,
      needs_setup: !!p.needs_setup,
      // internal-only flag for the Data Gaps report
      _gap: !!p.needs_setup || !supervisor || !p.employee_type || !p.division,
    }
  })
}

export function buildActivityRecords(data: RawData): ReportRow[] {
  const byId = new Map(data.profiles.map((p) => [p.id, p]))
  return data.activities.map((a) => {
    const p = byId.get(a.user_id)
    return {
      person: name(p),
      division: p?.division ?? '',
      department: p?.department ?? '',
      employee_type: p?.employee_type ?? '',
      title: a.title ?? '',
      type: a.type ?? '',
      activity_date: a.activity_date,
      hours: Number(a.hours) || 0,
      verified: !!a.verified,
      notes: a.notes ?? '',
    }
  })
}

export function buildFundingRecords(data: RawData): ReportRow[] {
  const byId = new Map(data.profiles.map((p) => [p.id, p]))
  return data.funding.map((f) => {
    const p = byId.get(f.user_id)
    const reviewer = f.reviewed_by ? byId.get(f.reviewed_by) : null
    return {
      person: name(p),
      division: p?.division ?? '',
      department: p?.department ?? '',
      employee_type: p?.employee_type ?? '',
      title: f.title ?? '',
      amount: Number(f.amount) || 0,
      status: f.status ?? '',
      is_overseas_travel: !!f.is_overseas_travel,
      decision_note: f.decision_note ?? '',
      reviewer: reviewer ? name(reviewer) : '',
      reviewed_at: f.reviewed_at,
      created_at: f.created_at,
    }
  })
}

export function recordsFor(subject: ReportSubject, data: RawData, cfg: FundConfig, target: number): ReportRow[] {
  if (subject === 'people') return buildPeopleRecords(data, cfg, target)
  if (subject === 'activities') return buildActivityRecords(data)
  return buildFundingRecords(data)
}

// ── Filtering ────────────────────────────────────────────────────
// The date field each subject filters on with dateFrom/dateTo.
const DATE_KEY: Record<ReportSubject, string> = {
  people: 'last_activity_date',
  activities: 'activity_date',
  funding: 'created_at',
}

function filterRecords(subject: ReportSubject, records: ReportRow[], f: ReportFilters): ReportRow[] {
  const dk = DATE_KEY[subject]
  return records.filter((r) => {
    if (f.division && r.division !== f.division) return false
    if (f.department && r.department !== f.department) return false
    if (f.employeeType && r.employee_type !== f.employeeType) return false
    if (f.status && r.status !== f.status) return false
    if (f.type && r.type !== f.type) return false
    if (f.verifiedOnly && !r.verified) return false
    if (f.gapsOnly && !r._gap) return false
    if (f.dateFrom || f.dateTo) {
      const d = r[dk]
      if (typeof d === 'string') {
        const day = d.slice(0, 10)
        if (f.dateFrom && day < f.dateFrom) return false
        if (f.dateTo && day > f.dateTo) return false
      }
    }
    return true
  })
}

// ── Run: filter → (group/aggregate) → columns ────────────────────
export interface ReportResult {
  columns: { key: string; label: string; type: FieldType }[]
  rows: (string | number | boolean | null)[][]
}

export function runReport(spec: ReportSpec, records: ReportRow[]): ReportResult {
  const fields = subjectFields(spec.subject)
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const recs = filterRecords(spec.subject, records, spec.filters ?? {})
  const cols = spec.columns.map((k) => byKey.get(k)).filter((f): f is FieldDef => !!f)

  if (spec.groupBy && byKey.has(spec.groupBy)) {
    const gf = byKey.get(spec.groupBy)!
    const numeric = cols.filter((c) => c.type === 'number' || c.type === 'currency')
    const groups = new Map<string, ReportRow[]>()
    for (const r of recs) {
      const raw = r[spec.groupBy]
      const key = raw === '' || raw == null ? '—' : String(raw)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    const columns = [
      { key: gf.key, label: gf.label, type: gf.type },
      { key: '_count', label: 'Count', type: 'number' as FieldType },
      ...numeric.map((c) => ({ key: c.key, label: `Total ${c.label}`, type: c.type })),
    ]
    const rows = Array.from(groups.entries())
      .map(([g, rs]) => [
        g,
        rs.length,
        ...numeric.map((c) => Math.round(rs.reduce((s, x) => s + (Number(x[c.key]) || 0), 0) * 100) / 100),
      ])
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    return { columns, rows }
  }

  return {
    columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.type })),
    rows: recs.map((r) => cols.map((c) => r[c.key])),
  }
}

// ── Value formatting ─────────────────────────────────────────────
export function displayValue(type: FieldType, v: string | number | boolean | null): string {
  if (v === null || v === undefined || v === '') return '—'
  if (type === 'currency') return formatUSD(Number(v) || 0)
  if (type === 'bool') return v ? 'Yes' : 'No'
  if (type === 'date') return typeof v === 'string' ? v.slice(0, 10) : String(v)
  if (type === 'number') return String(v)
  return String(v)
}

// Raw value for CSV/XLSX: numbers/currency stay numeric for spreadsheet math.
export function cellValue(type: FieldType, v: string | number | boolean | null): string | number {
  if (v === null || v === undefined) return ''
  if (type === 'currency' || type === 'number') return Number(v) || 0
  if (type === 'bool') return v ? 'Yes' : 'No'
  if (type === 'date') return typeof v === 'string' ? v.slice(0, 10) : String(v)
  return String(v)
}

// ── Canned reports (presets over the same engine) ────────────────
export const CANNED_REPORTS: CannedReport[] = [
  {
    id: 'staff-pd-scorecard',
    name: 'Staff PD Scorecard',
    description: 'Hours vs target, activity counts — who is on track',
    subject: 'people',
    columns: ['last_name', 'first_name', 'division', 'department', 'employee_type', 'pd_hours', 'pd_target', 'hours_vs_target', 'activity_count', 'last_activity_date'],
  },
  {
    id: 'fund-balances',
    name: 'Fund Balances',
    description: 'Allotment, approved, pending and remaining per person',
    subject: 'people',
    columns: ['last_name', 'first_name', 'division', 'department', 'allotment', 'approved_amount', 'pending_amount', 'balance_remaining'],
  },
  {
    id: 'observation-coverage',
    name: 'Observation Coverage',
    description: 'Who has observations and growth goals on file',
    subject: 'people',
    columns: ['last_name', 'first_name', 'division', 'department', 'observation_count', 'goal_count'],
  },
  {
    id: 'data-gaps',
    name: 'Data Gaps',
    description: 'Needs setup, no supervisor, or missing type/division',
    subject: 'people',
    columns: ['last_name', 'first_name', 'email', 'division', 'department', 'employee_type', 'primary_supervisor', 'needs_setup'],
    filters: { gapsOnly: true },
  },
  {
    id: 'pd-hours-rollup',
    name: 'PD Hours by Division',
    description: 'Total hours and headcount per division',
    subject: 'people',
    columns: ['division', 'pd_hours', 'activity_count'],
    groupBy: 'division',
  },
  {
    id: 'spending-rollup',
    name: 'Spending by Division',
    description: 'Approved funding grouped by division',
    subject: 'funding',
    columns: ['division', 'amount'],
    filters: { status: 'approved' },
    groupBy: 'division',
  },
  {
    id: 'pd-activity-log',
    name: 'PD Activity Log',
    description: 'Every logged activity, full detail',
    subject: 'activities',
    columns: ['person', 'division', 'department', 'title', 'type', 'activity_date', 'hours', 'verified', 'notes'],
  },
  {
    id: 'pd-by-type',
    name: 'PD by Type',
    description: 'Activity count and hours grouped by type',
    subject: 'activities',
    columns: ['type', 'hours'],
    groupBy: 'type',
  },
  {
    id: 'funding-ledger',
    name: 'Funding Ledger',
    description: 'Every funding request with status and decision',
    subject: 'funding',
    columns: ['person', 'division', 'title', 'amount', 'status', 'is_overseas_travel', 'decision_note', 'reviewer', 'reviewed_at', 'created_at'],
  },
  {
    id: 'full-roster',
    name: 'Full Roster',
    description: 'Every person with core profile fields',
    subject: 'people',
    columns: ['last_name', 'first_name', 'email', 'title', 'division', 'department', 'employee_type', 'access', 'employee_id', 'primary_supervisor'],
  },
]
