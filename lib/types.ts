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
  employee_type: string | null // 'faculty' | 'staff'
  avatar_url: string | null
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
  // joined
  creator?: Profile
}

export interface ResourceFavorite {
  id: string
  user_id: string
  resource_id: string
  created_at: string
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
  // joined
  owner?: Profile
  collaborators?: Profile[]
}

export interface GoalCollaborator {
  goal_id: string
  user_id: string
  // joined
  profile?: Profile
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
  // joined
  observer?: Profile
  observed?: Profile
  framework?: Framework
  ratings?: ObservationRating[]
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
