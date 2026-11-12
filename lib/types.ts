// ── Enum types ───────────────────────────────────────────────
export type RoleType = 'staff' | 'supervisor' | 'admin'

export type ResourceType =
  | 'website'
  | 'blog_post'
  | 'pdf'
  | 'podcast'
  | 'webinar'
  | 'certificate'
  | 'conference'
  | 'article'
  | 'tool'
  | 'book'
  | 'video'
  | 'other'

export type PdType =
  | 'workshop'
  | 'conference'
  | 'course'
  | 'webinar'
  | 'book_study'
  | 'coaching'
  | 'peer_observation'
  | 'self_directed'
  | 'other'

export type FundingStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export type GoalStatus = 'active' | 'completed' | 'archived' | 'paused'

export type ObsType = 'formal' | 'informal' | 'walkthrough' | 'self'

// ── Table interfaces ─────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  first_name: string
  last_name: string
  role: RoleType
  title: string | null
  division: string | null
  department: string | null
  employee_id: string | null
  employee_type: string | null // 'faculty' | 'staff' | 'admin'
  pd_allotment: number | null // per-person override; null = school default
  needs_setup: boolean
  can_create_workspaces: boolean
  can_approve_events?: boolean // may approve/publish & manage PD calendar events
  avatar_url: string | null
  favorites_public?: boolean // opt-in: colleagues may view my Resource Library favorites
  // Revised profile (Phase 1 — data only; not yet wired to permissions)
  campus?: string | null            // '86' | '46'
  teaches_classes?: boolean | null
  roles?: string[]                  // one or more of PD_ROLES
  // Development-track override (faculty | student_support | institutional).
  // null = derive from department. See lib/tracks.ts. Distinct from seniority
  // (roles[]) and access (role).
  track?: string | null
  created_at: string
}

export interface SupervisorAssignment {
  id: string
  staff_id: string
  supervisor_id: string
  is_primary: boolean
  created_at: string
  // joined
  staff?: Profile
  supervisor?: Profile
}

export interface Resource {
  id: string
  title: string
  description: string | null
  url: string | null
  file_url: string | null
  type: ResourceType
  tags: string[]
  cover_image: string | null
  audience: string[]
  themes: string[]
  subjects: string[]
  submitted_by: string | null
  is_approved: boolean
  created_at: string
  // joined
  submitted_by_profile?: Profile
  is_favorited?: boolean
}

export interface PdEvent {
  id: string
  title: string
  description: string | null
  event_type: string | null
  location: string | null
  is_virtual: boolean
  start_date: string
  end_date: string | null
  url: string | null
  cost: number | null
  audience: string[]
  created_by: string | null
  created_at: string
  // scraping / review queue
  status?: 'published' | 'pending' | 'rejected'
  source_id?: string | null
  external_key?: string | null
  is_auto?: boolean
  last_seen_at?: string | null
  // joined
  creator?: Profile
}

// ── Forms engine ─────────────────────────────────────────────
export type FormFieldType = 'short_text' | 'long_text' | 'select' | 'checkboxes' | 'date' | 'number' | 'link' | 'section'
export type FillBy = 'employee' | 'manager' | 'both'
export type FormCategory = 'form' | 'check_in'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  required?: boolean
  options?: string[] // for select / checkboxes
  help?: string
}

export interface FormTemplate {
  id: string
  title: string
  description: string | null
  fields: FormField[]
  fill_by: FillBy
  visible_to_employee: boolean
  is_active: boolean
  category: FormCategory // 'check_in' templates surface in the portfolio's Check-ins section
  // Routing: who this template applies to. Empty = everyone. See lib/tracks.ts
  // targetMatchesPerson().
  target_tracks?: string[] // subset of Track
  target_roles?: string[]  // subset of PD_ROLES
  // Optional competency framework this review captures evidence against (its
  // domains/indicators appear in the fill flow). See CompetencyEvidence.
  framework_id?: string | null
  created_by: string | null
  created_at: string
}

// A piece of competency evidence against a framework indicator (or a
// domain-level narrative when indicator_id is null), from a review or a
// project. The non-teaching mirror of Teaching with Grace's evidence model —
// evidence + description, no scores. See migration_competency_evidence.sql.
export interface CompetencyEvidence {
  id: string
  subject_id: string
  framework_id: string
  domain_id: string
  indicator_id: string | null
  source: 'review' | 'project'
  response_id?: string | null
  project_id?: string | null
  note: string | null
  author_id: string | null
  created_at: string
  // joined / hydrated
  framework?: { title: string } | null
  domain?: { title: string } | null
  indicator?: { title: string } | null
  author?: Profile | null
}

// ── Check-in cadence: an employee's chosen check-in frequency + note slots.
// See supabase/migration_checkin_schedule.sql.
export type CheckInFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'twice_yearly' | 'none'

export interface CheckInSchedule {
  id: string
  employee_id: string
  frequency: CheckInFrequency
  template_id: string | null
  start_date: string
  active: boolean
  created_at: string
  updated_at?: string
}

export interface CheckInNote {
  id: string
  employee_id: string
  author_id: string | null
  content: string
  shared: boolean
  created_at: string
  author?: Profile
}

export interface FormResponse {
  id: string
  template_id: string
  subject_id: string
  filled_by: string | null
  answers: Record<string, unknown>
  status: 'draft' | 'submitted'
  submitted_at: string | null
  created_at: string
}

export interface EventSource {
  id: string
  name: string
  url: string
  kind: 'auto' | 'ics' | 'html' | 'pdguide'
  is_active: boolean
  default_event_type: string | null
  default_audience: string[]
  last_run_at: string | null
  last_status: 'ok' | 'error' | 'skipped' | null
  last_count: number | null
  last_error: string | null
  added_by: string | null
  created_at: string
}

export interface ResourceFavorite {
  id: string
  user_id: string
  resource_id: string
  created_at: string
}

export type GoalType = 'standard' | 'faculty_inquiry'

// Cascade scope: an org goal (school/office) that individuals align under, or a
// person's own goal. See supabase/migration_cascading_goals.sql.
export type GoalScope = 'individual' | 'office' | 'school'

export interface FacultyInquiryDetails {
  question?: string
  capture?: string
  reflection?: string
}

export interface Goal {
  id: string
  title: string
  description: string | null
  owner_id: string
  due_date: string | null
  progress_pct: number
  status: GoalStatus
  created_at: string
  goal_type: GoalType
  details: FacultyInquiryDetails | null
  // Cascade: scope + the goal this one aligns up to.
  scope?: GoalScope
  parent_goal_id?: string | null
  // joined
  owner?: Profile
  collaborators?: Profile[]
  evidence_count?: number // observations tagged as evidence toward this goal
  parent?: { id: string; title: string; scope?: GoalScope } | null // hydrated client-side
  aligned_count?: number   // org goals: # of goals *directly* aligned under this one
  aligned_avg_pct?: number // org goals: avg progress of directly-aligned goals
  aligned_total?: number   // org goals: # of descendant goals across all levels
}

export interface GoalCollaborator {
  goal_id: string
  user_id: string
  // joined
  profile?: Profile
}

// ── Projects: a dedicated, collaborative work object (the non-teaching
// analogue of an observation — the evidence of work, distinct from a goal's
// outcome). See supabase/migration_projects.sql.
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'complete' | 'archived'
export type ProjectVisibility = 'normal' | 'private'

export interface ProjectMilestone {
  id: string
  project_id: string
  title: string
  due_date: string | null
  done: boolean
  sort_order: number
  created_at: string
}

export interface Project {
  id: string
  title: string
  description: string | null
  owner_id: string
  status: ProjectStatus
  progress_pct: number
  school_year_start: number | null // 2026 = 2026–27; scopes the portfolio
  start_date: string | null
  target_date: string | null
  drive_folder_url: string | null
  visibility: ProjectVisibility
  created_at: string
  updated_at?: string
  // joined / hydrated client-side
  owner?: Profile
  collaborators?: Profile[]
  milestones?: ProjectMilestone[]
  goals?: { id: string; title: string }[]
}

export interface GoalUpdate {
  id: string
  goal_id: string
  author_id: string
  content: string
  progress_pct: number | null
  created_at: string
  // joined
  author?: Profile
}

export interface PdActivity {
  id: string
  user_id: string
  title: string
  type: PdType
  activity_date: string
  hours: number
  notes: string | null
  verified: boolean
  created_at: string
  // joined
  user?: Profile
}

export interface FundingRequest {
  id: string
  user_id: string
  pd_activity_id: string | null
  title: string
  amount: number
  description: string | null
  is_overseas_travel: boolean
  status: FundingStatus
  reviewed_by: string | null
  reviewed_at: string | null
  decision_note: string | null
  created_at: string
  // joined
  user?: Profile
  reviewer?: Profile
  pd_activity?: PdActivity
}

export interface Spotlight {
  id: string
  from_user_id: string
  to_user_id: string
  message: string
  tags: string[]
  email_sent: boolean
  created_at: string
  // joined
  from_user?: Profile
  to_user?: Profile
}

export interface Framework {
  id: string
  title: string
  division: string | null
  department: string | null
  description: string | null
  // Routing: who this framework applies to. Empty = everyone. See
  // lib/tracks.ts targetMatchesPerson().
  target_tracks?: string[] // subset of Track
  target_roles?: string[]  // subset of PD_ROLES
  created_by: string | null
  created_at: string
  // joined
  domains?: FrameworkDomain[]
  creator?: Profile
}

export interface FrameworkDomain {
  id: string
  framework_id: string
  title: string
  description: string | null
  order_index: number
  // joined
  indicators?: FrameworkIndicator[]
}

export interface FrameworkIndicator {
  id: string
  domain_id: string
  title: string
  description: string | null
  order_index: number
}

export interface Observation {
  id: string
  observer_id: string
  observed_id: string
  framework_id: string | null
  obs_type: ObsType
  observed_at: string
  notes: string | null
  signed_off: boolean
  signed_off_at: string | null
  created_at: string
  // 'draft' (observer still working, hidden from the teacher) | 'published'.
  status: 'draft' | 'published'
  // Rich "Teaching with Grace" capture payload (see lib/twg.ts TwgData);
  // null for generic observations created via the standard form.
  twg_data: import('./twg').TwgData | null
  // Quick, collegial peer observation (see PeerData). When true, the row is
  // visible only to the observer and observed teacher — never admins.
  is_peer?: boolean
  peer_data?: PeerData | null
  // joined
  observer?: Profile
  observed?: Profile
  framework?: Framework
  ratings?: ObservationRating[]
}

// Payload for a quick peer observation (observations.peer_data). Deliberately
// light: what stood out, an optional wondering, which pillars it touched, and
// the class context.
export interface PeerData {
  focus: string[]      // Teaching with Grace pillar keys the feedback touches
  glow: string         // what stood out / a strength noticed
  suggestion: string   // an optional wondering or suggestion
  context: string      // optional: subject/class/what was happening
}

export interface ObservationRating {
  id: string
  observation_id: string
  domain_id: string
  rating: number
  notes: string | null
  // joined
  domain?: FrameworkDomain
}

// ── Workspaces ────────────────────────────────────────────────
export type DriveIconType = 'doc' | 'sheet' | 'slide' | 'form' | 'pdf' | 'file'

export interface Workspace {
  id: string
  name: string
  description: string | null
  rule_division: string | null
  rule_department: string | null
  rule_employee_type: string | null
  drive_folder_url: string | null
  created_by: string | null
  created_at: string
  // joined
  creator?: Profile
  member_count?: number
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  is_manager: boolean
  added_via: 'manual' | 'rule'
  created_at: string
  // joined
  profile?: Profile
}

export interface WorkspacePost {
  id: string
  workspace_id: string
  author_id: string
  title: string | null
  content: string
  is_pinned: boolean
  created_at: string
  // joined
  author?: Profile
  files?: WorkspaceFile[]
}

export interface WorkspaceFile {
  id: string
  workspace_id: string
  post_id: string | null
  uploaded_by: string | null
  name: string
  file_url: string | null
  drive_url: string | null
  drive_icon: DriveIconType | null
  size_bytes: number | null
  created_at: string
  // joined
  uploader?: Profile
}

// ── Utility types ─────────────────────────────────────────────
export type ProfileWithSupervisors = Profile & {
  supervisors: Profile[]
}

export type DashboardMetrics = {
  totalPdHours: number
  pdActivityCount: number
  activeGoalsCount: number
  observationCount: number
  pendingFundingCount: number
}
