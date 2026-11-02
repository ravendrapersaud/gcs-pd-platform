// ── Role (access-level) display labels ───────────────────────────
// role is the ACCESS level (staff | supervisor | admin), distinct from
// employee_type (the job type: faculty | staff | admin). These helpers
// centralize how a role is shown so the wording stays consistent.
//
// Two variants by context:
//  - access  : how a person's access appears to others (roster Access
//              column, role dropdowns/filter). admin → "Platform Admin".
//  - self    : the signed-in user's own status badge (Sidebar/TopBar).
//              admin → "System Admin".

import type { RoleType } from './types'

// ── Revised role model (seven scoped roles) ──────────────────────
// A person holds one OR MORE of these; two roles grant the union of their
// capabilities. Each has a scope of "reach" (whole school → campus → division
// → department → self). Phase 1 stores these as data; permissions still use
// the legacy `role` access level above until later phases wire them up.
export const PD_ROLES = [
  'Full Access',
  'Campus Head',
  'Division Leader',
  'Senior Administrator',
  'Team Lead',
  'Faculty',
  'Staff',
] as const
export type PdRole = (typeof PD_ROLES)[number]

export const ROLE_ACCESS_LABELS: Record<RoleType, string> = {
  staff: 'Member',
  supervisor: 'Supervisor',
  admin: 'Platform Admin',
}

export const ROLE_SELF_LABELS: Record<RoleType, string> = {
  staff: 'Member',
  supervisor: 'Supervisor',
  admin: 'System Admin',
}

export function roleAccessLabel(role: string | null | undefined): string {
  return ROLE_ACCESS_LABELS[role as RoleType] ?? 'Member'
}

export function roleSelfLabel(role: string | null | undefined): string {
  return ROLE_SELF_LABELS[role as RoleType] ?? 'Member'
}
