// ── PD fund allotment config ──────────────────────────────────
// Each staff/faculty member receives this PD fund allotment per
// academic year. It "resets" automatically because usage is only
// counted within the current academic year window (see below).
export const ANNUAL_PD_ALLOTMENT = 3100

// Academic year is July 1 → June 30. Change ACADEMIC_YEAR_START_MONTH
// (0-indexed: 6 = July) if the school's fiscal/PD year differs.
export const ACADEMIC_YEAR_START_MONTH = 6

// Returns the [start, end) date range of the academic year that
// contains `ref` (defaults to now).
export function academicYearRange(ref: Date = new Date()): { start: Date; end: Date } {
  const y = ref.getFullYear()
  const startYear = ref.getMonth() >= ACADEMIC_YEAR_START_MONTH ? y : y - 1
  const start = new Date(startYear, ACADEMIC_YEAR_START_MONTH, 1)
  const end = new Date(startYear + 1, ACADEMIC_YEAR_START_MONTH, 1)
  return { start, end }
}

// A human label like "2026–2027" for the current academic year.
export function academicYearLabel(ref: Date = new Date()): string {
  const { start } = academicYearRange(ref)
  return `${start.getFullYear()}–${start.getFullYear() + 1}`
}

// True if `dateStr` (ISO/date string) falls in the current academic year.
export function isInCurrentAcademicYear(dateStr: string): boolean {
  const { start, end } = academicYearRange()
  const d = new Date(dateStr)
  return d >= start && d < end
}

export function formatUSD(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
