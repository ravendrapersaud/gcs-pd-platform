// ── School-wide platform settings ────────────────────────────────
// Key/value rows in app_settings (admin-editable via Dashboard →
// Admin → Settings). Pure module (no Supabase imports): pages fetch
// the rows and pass them to these parsers, mirroring lib/funds.ts.

export interface AppSettingRow {
  key: string
  value: string
}

export const DEFAULT_PD_HOURS_TARGET = 40

export function settingsMap(rows: AppSettingRow[] | null | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    if (row?.key) map[row.key] = row.value
  }
  return map
}

// Annual PD hours goal shown on dashboards and reports.
export function pdHoursTarget(rows: AppSettingRow[] | null | undefined): number {
  const n = Number(settingsMap(rows)['pd_hours_target'])
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PD_HOURS_TARGET
}

// Funding requests above this amount require admin approval.
// null = no threshold configured (blank setting).
export function fundingAdminThreshold(rows: AppSettingRow[] | null | undefined): number | null {
  const raw = (settingsMap(rows)['funding_admin_threshold'] ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Whether staff may submit funding requests exceeding their remaining
// balance (default true).
export function allowOverBalanceRequests(rows: AppSettingRow[] | null | undefined): boolean {
  return (settingsMap(rows)['allow_over_balance_requests'] ?? 'true') !== 'false'
}

// Whether new resource submissions need admin approval (default off).
export function resourceModerationOn(rows: AppSettingRow[] | null | undefined): boolean {
  return (settingsMap(rows)['resource_moderation'] ?? 'off') === 'on'
}

// Who can create workspaces (default: supervisors/admins + granted).
export function workspaceCreationPolicy(
  rows: AppSettingRow[] | null | undefined
): 'supervisors' | 'everyone' {
  return settingsMap(rows)['workspace_creation_policy'] === 'everyone' ? 'everyone' : 'supervisors'
}
