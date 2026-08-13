// ── Shared taxonomy for resources & events ───────────────────
// Used by the resource library, submit form, and PD calendar.

export const AUDIENCES = [
  'Early Childhood', 'Lower School', 'Middle School', 'High School',
  'Faculty', 'Staff', 'Administration',
  'Technology', 'Communications', 'Advancement', 'College Office', 'Business Office', 'Athletics',
] as const

export const SUBJECTS = [
  'English', 'Mathematics', 'Science', 'History & Social Studies', 'World Languages',
  'Arts', 'Physical Education & Health', 'Library', 'Computer Science', 'Interdisciplinary',
] as const

export const THEMES = [
  'Classroom Management', 'Assessment', 'Writing', 'Reading & Literacy', 'DEI',
  'Social-Emotional Learning', 'AI & EdTech', 'Project-Based Learning', 'Leadership',
  'Curriculum Design', 'Differentiation', 'Family Engagement',
  // Categories from the 'PD and Resource Lists' Google Doc import.
  'Teaching Lessons', 'Designing Courses', 'Building Relationships',
  'Academic Leadership', 'Modeling Virtues', 'Grace Curated Lists',
] as const

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  website: 'Website', blog_post: 'Blog Post', pdf: 'PDF Document', video: 'Video',
  podcast: 'Podcast', webinar: 'Webinar', certificate: 'Certificate',
  conference: 'Conference', article: 'Article', tool: 'Tool', book: 'Book', other: 'Other',
}

// Ordered list of resource types for filter chips / select options.
export const RESOURCE_TYPES = [
  'website', 'blog_post', 'pdf', 'video', 'podcast', 'webinar',
  'certificate', 'conference', 'article', 'tool', 'book', 'other',
] as const

// Event types for the PD calendar.
export const EVENT_TYPES = [
  'Conference', 'Workshop', 'Webinar', 'Local Event', 'Certificate Program',
] as const

// School divisions (with short codes) for the staff roster sub-filter.
export const DIVISIONS = [
  { code: 'EC', name: 'Early Childhood' },
  { code: 'LS', name: 'Lower School' },
  { code: 'MS', name: 'Middle School' },
  { code: 'HS', name: 'High School' },
] as const

// Division options for people-pickers: the four teaching divisions plus
// "All School" for cross-division roles (administration, operations, tech).
export const DIVISION_OPTIONS: string[] = [
  ...DIVISIONS.map((d) => d.name),
  'All School',
]

// Department options for the roster, grouped: academic (teaching faculty)
// vs. role-based (staff & administration). Not exhaustive — the roster UI
// merges any other value already present in the data so nothing is lost.
export const DEPARTMENT_GROUPS: { label: string; options: readonly string[] }[] = [
  { label: 'Academic', options: SUBJECTS },
  {
    label: 'Administrative & Operations',
    options: [
      'Administration', 'Admissions', 'Advancement', 'Athletics',
      'Business Office', 'College Office', 'Communications', 'Facilities',
      'Health Services', 'Human Resources', 'Operations', 'Technology',
    ],
  },
]

// Employee types (job category, distinct from access role). 'admin' =
// Administration; like 'staff' it uses the staff fund-year window (see
// lib/funds.ts yearStartFor).
export const EMPLOYEE_TYPES = ['faculty', 'staff', 'admin'] as const
