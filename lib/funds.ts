// ── PD fund policy ───────────────────────────────────────────────
// Amounts and fund-year start dates are admin-configurable via the
// app_settings table (Dashboard → Admin → Settings). This module is
// intentionally pure (no Supabase imports): pages fetch the
// app_settings rows themselves and pass them to parseFundSettings.

export interface FundConfig {
  defaultAllotment: number
  staffYearStart: { month: number; day: number } // month is 0-indexed
  facultyYearStart: { month: number; day: number }
}

// Used when settings can't be loaded (or a row is missing/malformed).
export const FALLBACK_FUND_CONFIG: FundConfig = {
  defaultAllotment: 3100,
  staffYearStart: { month: 6, day: 1 },    // July 1
  facultyYearStart: { month: 7, day: 25 }, // August 25
}

// Parses an 'MM-DD' settings value into a 0-indexed month/day pair.
function parseMonthDay(value: string | undefined, fallback: { month: number; day: number }): { month: number; day: number } {
  if (!value) return fallback
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!m) return fallback
  const month = Number(m[1]) - 1
  const day = Number(m[2])
  if (!Number.isInteger(month) || month < 0 || month > 11) return fallback
  if (!Number.isInteger(day) || day < 1 || day > 31) return fallback
  return { month, day }
}

// Builds a FundConfig from raw app_settings rows. Missing or malformed
// rows fall back to FALLBACK_FUND_CONFIG values.
export function parseFundSettings(rows: { key: string; value: string }[] | null | undefined): FundConfig {
  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    if (row?.key) map[row.key] = row.value
  }
  const allotment = Number(map['default_pd_allotment'])
  return {
    defaultAllotment: Number.isFinite(allotment) && allotment > 0
      ? allotment
      : FALLBACK_FUND_CONFIG.defaultAllotment,
    staffYearStart: parseMonthDay(map['staff_fund_year_start'], FALLBACK_FUND_CONFIG.staffYearStart),
    facultyYearStart: parseMonthDay(map['faculty_fund_year_start'], FALLBACK_FUND_CONFIG.facultyYearStart),
  }
}

function yearStartFor(employeeType: string | null | undefined, cfg: FundConfig): { month: number; day: number } {
  // Faculty use the faculty start date; staff and anyone unclassified
  // use the staff start date.
  return (employeeType ?? '').toLowerCase() === 'faculty'
    ? cfg.facultyYearStart
    : cfg.staffYearStart
}

// Returns the [start, end) range of the fund year containing `ref`
// (defaults to now) for the given employee type.
export function fundYearRange(
  employeeType: string | null | undefined,
  cfg: FundConfig,
  ref: Date = new Date()
): { start: Date; end: Date } {
  const { month, day } = yearStartFor(employeeType, cfg)
  const thisYearsStart = new Date(ref.getFullYear(), month, day)
  const startYear = ref >= thisYearsStart ? ref.getFullYear() : ref.getFullYear() - 1
  const start = new Date(startYear, month, day)
  const end = new Date(startYear + 1, month, day)
  return { start, end }
}

// A human label like "2026–2027" for the current fund year.
export function fundYearLabel(
  employeeType: string | null | undefined,
  cfg: FundConfig,
  ref: Date = new Date()
): string {
  const { start } = fundYearRange(employeeType, cfg, ref)
  return `${start.getFullYear()}–${start.getFullYear() + 1}`
}

// True if `dateStr` (ISO/date string) falls in the person's current fund year.
export function isInFundYear(
  dateStr: string,
  employeeType: string | null | undefined,
  cfg: FundConfig
): boolean {
  const { start, end } = fundYearRange(employeeType, cfg)
  const d = new Date(dateStr)
  return d >= start && d < end
}

// A person's annual allotment: their profile override if set, else the
// school default. NaN / non-numeric overrides fall back to the default.
export function effectiveAllotment(
  profile: { pd_allotment?: number | null } | null | undefined,
  cfg: FundConfig
): number {
  const raw = profile?.pd_allotment
  if (raw === null || raw === undefined) return cfg.defaultAllotment
  const n = Number(raw)
  return Number.isFinite(n) ? n : cfg.defaultAllotment
}

export function formatUSD(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── Deprecated flat-config API ───────────────────────────────────
// Thin wrappers over FALLBACK_FUND_CONFIG kept for compatibility.
// Prefer parseFundSettings + fundYearRange/effectiveAllotment.

/** @deprecated Use effectiveAllotment(profile, cfg) with parsed app_settings. */
export const ANNUAL_PD_ALLOTMENT = FALLBACK_FUND_CONFIG.defaultAllotment

/** @deprecated Use fundYearRange(employeeType, cfg, ref). */
export function academicYearRange(ref: Date = new Date()): { start: Date; end: Date } {
  return fundYearRange('staff', FALLBACK_FUND_CONFIG, ref)
}

/** @deprecated Use fundYearLabel(employeeType, cfg, ref). */
export function academicYearLabel(ref: Date = new Date()): string {
  return fundYearLabel('staff', FALLBACK_FUND_CONFIG, ref)
}

/** @deprecated Use isInFundYear(dateStr, employeeType, cfg). */
export function isInCurrentAcademicYear(dateStr: string): boolean {
  return isInFundYear(dateStr, 'staff', FALLBACK_FUND_CONFIG)
}
