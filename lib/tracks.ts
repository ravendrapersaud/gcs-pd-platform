// ── Staff "track" — the development axis, distinct from seniority ──
// A track answers "what kind of development work frames this person's
// portfolio," NOT how senior they are. Seniority (a CTO vs. an IT
// technician) is a separate axis carried by profiles.roles[] (PD_ROLES:
// Senior Administrator / Team Lead / …) and the access `role`. A CTO and a
// technician share the *Institutional* track but differ by role.
//
//   faculty          — teaching staff. Portfolio spine = observations + goals.
//   student_support  — non-teaching but student-facing (counselors, nurses,
//                      learning specialists). Portfolio spine = projects +
//                      check-ins, with confidentiality defaults ON (clinical
//                      / student notes).
//   institutional    — non-teaching, non-clinical (operations, advancement,
//                      business, communications, technology). Same
//                      project/check-in spine, no confidentiality default.
//
// Pure module (no Supabase imports): pages fetch the student-support
// department list from app_settings and pass it in, mirroring
// lib/appSettings.ts and lib/funds.ts.

export type Track = 'faculty' | 'student_support' | 'institutional'

export const TRACKS: Track[] = ['faculty', 'student_support', 'institutional']

export const TRACK_LABELS: Record<Track, string> = {
  faculty: 'Faculty',
  student_support: 'Student Support',
  institutional: 'Institutional',
}

export const TRACK_BLURBS: Record<Track, string> = {
  faculty: 'Teaching staff — observations and goals.',
  student_support: 'Student-facing support (counseling, health, learning support) — projects and check-ins, confidential by default.',
  institutional: 'Operations, advancement, business, communications, technology — projects and check-ins.',
}

// Departments whose members are student-facing support. Admin-editable in
// Admin → Settings (one per line); these are the defaults when unset. The
// school may not yet carry Counseling / Learning Support as roster
// departments — adding them there and here is how a nurse/counselor/learning
// specialist lands on the Student Support track.
export const DEFAULT_STUDENT_SUPPORT_DEPARTMENTS: string[] = [
  'Health Services',
  'Counseling',
  'Counseling & Guidance',
  'Learning Support',
  'Learning Specialists',
  'Student Support',
  'Psychology',
  'Social Work',
]

export function isTrack(v: unknown): v is Track {
  return v === 'faculty' || v === 'student_support' || v === 'institutional'
}

function parseLines(v: string | undefined): string[] {
  return (v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
}

// The admin-configured student-support department list (from an app_settings
// map), falling back to the defaults when the setting is blank.
export function studentSupportDepartments(settings: Record<string, string> | null | undefined): string[] {
  const raw = (settings?.['student_support_departments'] ?? '').trim()
  return raw ? parseLines(raw) : [...DEFAULT_STUDENT_SUPPORT_DEPARTMENTS]
}

// What a person's track is for development purposes. The explicit
// profiles.track override always wins; otherwise it is derived:
//   teaching → faculty; student-support department → student_support;
//   everything else → institutional.
export interface TrackInputs {
  track?: string | null                 // per-person override (null = derive)
  employee_type?: string | null         // 'faculty' | 'staff' | 'admin'
  teaches_classes?: boolean | null
  department?: string | null
}

export function trackForProfile(
  p: TrackInputs,
  studentSupportDepts: string[]
): Track {
  if (isTrack(p.track)) return p.track
  if (p.employee_type === 'faculty' || p.teaches_classes === true) return 'faculty'
  const dept = (p.department ?? '').trim().toLowerCase()
  if (dept && studentSupportDepts.some((d) => d.trim().toLowerCase() === dept)) {
    return 'student_support'
  }
  return 'institutional'
}

// Whether a track carries confidentiality defaults (student-facing clinical /
// counseling work). Drives the default project visibility and check-in note
// guidance for these constituencies.
export function trackIsConfidential(t: Track): boolean {
  return t === 'student_support'
}
