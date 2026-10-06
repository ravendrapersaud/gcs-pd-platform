// ── Teaching with Grace (TWG) ────────────────────────────────────
// Grace Church School's shared teaching framework and the observation
// capture model, ported from the "Teaching with Grace Observations"
// tool (framework content v. 8.26.25). This is the single source of
// truth for the capture UI; the same content is seeded into the
// frameworks / framework_domains / framework_indicators tables by
// supabase/migration_teaching_with_grace.sql so it is also a
// first-class framework in reporting and the generic observation form.

export const TWG_FRAMEWORK_TITLE = 'Teaching with Grace'

export const TWG_MISSION =
  'At Grace Church School, teaching is the shared work of fostering intellect, ' +
  'character, and joy. These commitments define what it means to teach at Grace, ' +
  'so that each student is well known, well loved, and well taught.'

export type PillarKey = 'dc' | 'tl' | 'br' | 'mv'

export interface Pillar {
  key: PillarKey
  name: string
  abbr: string
  focus: string
  text: string
  lookfors: string[]
}

export const PILLARS: Pillar[] = [
  {
    key: 'dc', name: 'Designing Courses', abbr: 'DC',
    focus: 'Clear purpose, intellectual challenge, intentional course design.',
    text:
      'Grace faculty members teach with purpose, designing curriculum from clearly defined ' +
      'goals for what students will know—and will know how to do—as a result of their time in ' +
      'a course. Courses should strengthen student capacity for intellectual challenge (as when ' +
      'applying complex skills to novel contexts) and for ethical reflection (as when grappling ' +
      'with multiple thoughtful perspectives on complex questions).',
    lookfors: [
      'Lesson goals are clear and explicitly connected to broader course aims.',
      'The lesson builds on previous knowledge.',
      'The lesson fits into the broader backwards-designed course.',
    ],
  },
  {
    key: 'tl', name: 'Teaching Lessons', abbr: 'TL',
    focus: 'Evidence-informed practices, effortful thinking, joyful learning.',
    text:
      'Grace teachers ensure courses achieve their aims by designing thoughtful lessons and using ' +
      'evidence-informed practices to carry them out. Teachers align lesson goals with the larger ' +
      'aims of the course, setting ambitious expectations and providing the feedback and support ' +
      'students need to meet them. Effortful thinking, joyful learning, and deep belonging are ' +
      'hallmarks of great teaching at Grace.',
    lookfors: [
      'The space is set up to maximize engagement.',
      'Evidence-informed practices are in use (scaffolding, clear explanations, practicing recall and memory).',
      'High expectations are paired with actionable feedback and support.',
      'Students are actively engaged in effortful, productive thinking.',
      'Tasks encourage intellectual challenge (e.g., applying skills to novel contexts).',
    ],
  },
  {
    key: 'br', name: 'Building Relationships', abbr: 'BR',
    focus:
      'Knowing each student as an individual and differentiating for the actual learners in the ' +
      'room. A culture that avoids bias, increases equitable access to material, and builds deep belonging.',
    text:
      'Grace teachers strive to know and treat each student as a unique and inherently valuable ' +
      'individual. Cherishing the diverse experiences and talents of their students, teachers design ' +
      'lessons and differentiate instruction not for an imagined learner but for the actual children ' +
      'in their classrooms and in their care.',
    lookfors: [
      'The teacher demonstrates deep knowledge of individual students, including their strengths, needs, and identities.',
      'Instruction and support are differentiated for the actual children present.',
      'Peer-to-peer and teacher–student interactions show mutual warmth and respect.',
    ],
  },
  {
    key: 'mv', name: 'Modeling Virtues', abbr: 'MV',
    focus: 'Practicing dignity, kindness, curiosity, humility, and courage.',
    text:
      'Grace teachers model the habits and virtues we want our students to develop. They demonstrate ' +
      'respect for the dignity of everyone in the community, practicing the kindness, curiosity, ' +
      'humility, and courage that we seek to nurture in our students.',
    lookfors: [
      'The teacher models respect for the inherent dignity of all community members, emphasizing community values.',
      'The teacher models curiosity, open-mindedness, and a love of learning.',
      'The teacher handles challenges or mistakes with patience, humility, and grace.',
      'Classroom norms and expectations are clear and reinforced.',
      'Content invites ethical reflection or multiple thoughtful perspectives.',
    ],
  },
]

export const PILLAR_MAP: Record<PillarKey, Pillar> = Object.fromEntries(
  PILLARS.map((p) => [p.key, p])
) as Record<PillarKey, Pillar>

export interface Addon {
  key: string
  name: string
  short: string
  hint: string
  lookfors: string[]
}

// Discipline/division-specific look-fors layered on top of the four pillars.
export const ADDONS: Addon[] = [
  { key: 'space', name: 'Learning space & setup', short: 'Space', hint: 'Lighting, sound, seating, cognitive load, materials',
    lookfors: ['Lighting suits the task.', 'Sound and acoustics let every student hear.', 'Seating matches the activity (pairs, groups, whole class).', 'The room avoids cognitive overload: displays and screens are purposeful, uncluttered, and tied to current learning.', 'Materials are within reach and ready.', 'Students use materials appropriately.', 'Movement and transitions flow without lost time.'] },
  { key: 'ec', name: 'Early Childhood', short: 'EC', hint: 'CKLA, Bridges, classroom routines',
    lookfors: ['CKLA: the literacy lesson follows the program’s sequence, adapted for the children in the room.', 'Bridges: the math lesson uses the program’s visual models, manipulatives, and discussion.', 'Classroom routines: transitions, materials, and expectations are predictable and have been taught.', 'Play and hands-on exploration are built into the learning.', 'Directions come in small steps, with modeling.', 'The teacher helps children notice and regulate feelings.'] },
  { key: 'lower', name: 'Lower School', short: 'LS', hint: 'CKLA, Bridges, classroom routines',
    lookfors: ['CKLA: the literacy lesson follows the program’s sequence, adapted for the students in the room.', 'Bridges: the math lesson uses the program’s visual models, manipulatives, and discussion.', 'Classroom routines: transitions, materials, and expectations are predictable and have been taught.', 'Directions come in small steps, with modeling.', 'Students put their thinking into words (turn-and-talk, sharing).', 'Students have age-appropriate choice and independence.'] },
  { key: 'lang', name: 'World Languages', short: 'Language', hint: 'Target language, listening, speaking',
    lookfors: ['The target language is used for most of the class.', 'Input is made comprehensible (visuals, gestures, recycled vocabulary).', 'Listening tasks have a clear purpose and build across repeated listens.', 'Students produce language, not only receive it.', 'Culture is woven into the content.'] },
  { key: 'arts', name: 'Visual & Performing Arts', short: 'Arts', hint: 'Studio, music, theater, dance',
    lookfors: ['Technique is demonstrated or modeled.', 'Students get time to practice with feedback.', 'Critique follows clear, kind norms.', 'Students make real creative choices.', 'Process is valued alongside the product.'] },
  { key: 'pe', name: 'PE & Athletics', short: 'PE', hint: 'Gym, field, team practice',
    lookfors: ['Students are active for most of the session.', 'Skills are broken into progressions.', 'Safety expectations are clear and followed.', 'Groupings include every student.', 'Sportsmanship is taught and recognized.'] },
  { key: 'sci', name: 'Science & Labs', short: 'Science', hint: 'Inquiry, modeling, lab safety',
    lookfors: ['Inquiry: students ask questions and make predictions before investigating.', 'Modeling: students build, use, or revise models to explain what they observe.', 'Lab safety: procedures are taught, modeled, and followed.', 'Students collect data and reason from it.'] },
  { key: 'math', name: 'Mathematics', short: 'Math', hint: 'Strategies, discourse, representations',
    lookfors: ['More than one strategy is shared and compared.', 'Students explain and justify their reasoning.', 'Errors are used as material for learning.', 'Representations (visual, symbolic, verbal) are connected.'] },
  { key: 'hum', name: 'English & History', short: 'Humanities', hint: 'Texts, sources, discussion, writing',
    lookfors: ['Students read texts or sources closely.', 'Discussion is grounded in evidence.', 'Writing is used as a way to think.', 'Multiple perspectives are weighed.'] },
  { key: 'tech', name: 'Technology & AI', short: 'Tech/AI', hint: 'Devices, tools, AI use',
    lookfors: ['Technology serves the learning goal.', 'Students use tools purposefully and independently.', 'Norms for AI use are clear and discussed.', 'Screens do not crowd out conversation.'] },
]

export const ADDON_MAP: Record<string, Addon> = Object.fromEntries(ADDONS.map((a) => [a.key, a]))

export type ObsMode = 'popin' | 'short' | 'full'

export const MODES: Record<ObsMode, { label: string; time: string; desc: string }> = {
  popin: { label: 'Pop-in', time: '5–10 min', desc: 'Drop in and notice one pillar. Skip the pre-observation meeting.' },
  short: { label: 'Short', time: '15–25 min', desc: 'Focus on the one or two pillars the teacher asked about.' },
  full: { label: 'Full', time: 'A full class', desc: 'All four pillars, the pre-observation conversation, and a post-observation meeting.' },
}

// Who a live note is about.
export const WHO: Record<string, string> = { T: 'Teacher', S: 'Students', E: 'Space', '': 'Note' }

// Simple Model of Teaching — a companion lens for Teaching Lessons.
// Goodrich, Mccrea & Lovell (2025), adapted from Caviglioli (2019) and Willingham (2009).
export const SMT: [string, string][] = [
  ['Select curriculum', 'Has the teacher chosen the right ideas, in the right order?'],
  ['Create culture', 'Are routines, environment, and behavior for learning in place?'],
  ['Secure attention', 'Does the teacher have students’ attention?'],
  ['Optimise communication', 'Are ideas presented in a way students can manage?'],
  ['Drive thought', 'Is the teacher pushing students to think hard?'],
  ['Gather and give feedback', 'Is the teacher checking learning and responding?'],
  ['Ensure consolidation', 'Is the teacher helping students consolidate what they learned?'],
]

// ── Capture payload (stored in observations.twg_data) ────────────
// A tagged span within a note's text: [start, end) char offsets → pillar keys.
export interface NoteSpan {
  start: number
  end: number
  tags: string[] // pillar keys (any or all of the four)
}

export interface TwgNote {
  id: string
  t: number // ms elapsed since the timer started
  who: string // 'T' | 'S' | 'E' | ''
  text: string
  tags: string[] // whole-note tags (pillar and/or addon keys) — quick path
  spans?: NoteSpan[] // span-level pillar tags on portions of the text
}

// Pillar accent colors for span highlights.
export const PILLAR_COLORS: Record<PillarKey, string> = {
  dc: '#003882', // navy
  tl: '#0f766e', // teal
  br: '#b45309', // amber
  mv: '#7c3aed', // violet
}

// Every pillar a note touches — whole-note tags plus any span tag.
export function pillarTagsForNote(note: TwgNote): PillarKey[] {
  const keys = new Set<string>(note.tags)
  for (const s of note.spans ?? []) for (const t of s.tags) keys.add(t)
  return PILLARS.map((p) => p.key).filter((k) => keys.has(k))
}

// The text a note contributes to a given pillar: just the highlighted
// span(s) when tagged at span level, or the whole note when the pillar was
// applied to the entire note (the quick-tag chips).
export function pillarExcerptsForNote(note: TwgNote, pillar: PillarKey): string[] {
  const out: string[] = []
  if (note.tags.includes(pillar)) out.push(note.text.trim())
  for (const s of note.spans ?? []) {
    if (!s.tags.includes(pillar)) continue
    const start = Math.max(0, Math.min(note.text.length, s.start))
    const end = Math.max(0, Math.min(note.text.length, s.end))
    const excerpt = note.text.slice(start, end).trim()
    if (excerpt) out.push(excerpt)
  }
  return Array.from(new Set(out))
}

export interface NoteSegment { text: string; tags: string[] }

// Split a note's text into non-overlapping segments, each carrying the
// union of pillar tags from the spans covering it (handles overlaps).
export function segmentsFromSpans(text: string, spans: NoteSpan[] | undefined): NoteSegment[] {
  if (!spans || spans.length === 0) return [{ text, tags: [] }]
  const clamp = (n: number) => Math.max(0, Math.min(text.length, n))
  const bounds = new Set<number>([0, text.length])
  for (const s of spans) { bounds.add(clamp(s.start)); bounds.add(clamp(s.end)) }
  const points = Array.from(bounds).sort((a, b) => a - b)
  const segs: NoteSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    if (a === b) continue
    const tags = new Set<string>()
    for (const s of spans) if (clamp(s.start) <= a && clamp(s.end) >= b) for (const t of s.tags) tags.add(t)
    segs.push({ text: text.slice(a, b), tags: Array.from(tags) })
  }
  return segs
}

export interface CategoryAnalysis {
  strengths: string
  growth: string
  flag: boolean // follow-up support flag
}
/** @deprecated use CategoryAnalysis */
export type PillarAnalysis = CategoryAnalysis

// A framework domain the observation is structured by. The title is
// denormalized into the payload so cards/reports render without a domain
// join and keep the label the observer saw even if the domain is later renamed.
export interface CaptureCategory { id: string; title: string }

// Accent palette for category highlights (cycles for frameworks with many domains).
export const CATEGORY_PALETTE = ['#003882', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#4d7c0f', '#0369a1', '#9333ea']
export function categoryColor(index: number): string {
  return CATEGORY_PALETTE[((index % CATEGORY_PALETTE.length) + CATEGORY_PALETTE.length) % CATEGORY_PALETTE.length]
}

// Every category a note touches — whole-note tags plus any span tag.
export function tagsForNote(note: TwgNote): string[] {
  const keys = new Set<string>(note.tags)
  for (const s of note.spans ?? []) for (const t of s.tags) keys.add(t)
  return Array.from(keys)
}

// The text a note contributes to a given category: the highlighted span(s)
// when tagged at span level, or the whole note when the category was applied
// to the entire note (the quick-tag chips).
export function excerptsForNote(note: TwgNote, key: string): string[] {
  const out: string[] = []
  if (note.tags.includes(key)) out.push(note.text.trim())
  for (const s of note.spans ?? []) {
    if (!s.tags.includes(key)) continue
    const start = Math.max(0, Math.min(note.text.length, s.start))
    const end = Math.max(0, Math.min(note.text.length, s.end))
    const excerpt = note.text.slice(start, end).trim()
    if (excerpt) out.push(excerpt)
  }
  return Array.from(new Set(out))
}

export interface TwgPre {
  focus: string
  objective: string
  unit: string
  style: string
}

export interface TwgWrap {
  context: string
  overall: string
  next: string
  questions: string
}

// Framework-agnostic observation capture, stored in observations.twg_data.
// Categories are the chosen framework's domains; notes/spans/analysis are
// keyed by domain id.
export interface TwgData {
  version: 2
  frameworkTitle?: string
  mode: ObsMode
  categories: CaptureCategory[]
  course: string
  division: string
  pre: TwgPre
  notes: TwgNote[]
  analysis: Record<string, CategoryAnalysis>
  // Look-fors (indicator titles) the observer checked as noticed, per domain id.
  checks: Record<string, string[]>
  wrap: TwgWrap
  durationMs: number | null
}

// obs_type (existing enum) each capture mode maps to.
export const MODE_TO_OBS_TYPE: Record<ObsMode, 'formal' | 'informal' | 'walkthrough'> = {
  full: 'formal',
  short: 'informal',
  popin: 'walkthrough',
}

export function emptyTwgData(mode: ObsMode): TwgData {
  return {
    version: 2,
    mode,
    categories: [],
    course: '',
    division: '',
    pre: { focus: '', objective: '', unit: '', style: '' },
    notes: [],
    analysis: {},
    checks: {},
    wrap: { context: '', overall: '', next: '', questions: '' },
    durationMs: null,
  }
}

// Coerce any stored twg_data (including the legacy v1 pillar-keyed shape)
// into the current category model, so resuming older observations never
// crashes. `domains` are the observation's framework domains, used to map
// legacy pillar keys → domain ids by matching the pillar name to a title.
export function normalizeCapture(raw: unknown, domains: { id: string; title: string }[]): TwgData {
  const base = emptyTwgData('full')
  if (!raw || typeof raw !== 'object') {
    return { ...base, categories: domains.map((d) => ({ id: d.id, title: d.title })) }
  }
  const r = raw as Record<string, unknown>
  const data: TwgData = {
    ...base,
    version: 2,
    frameworkTitle: typeof r.frameworkTitle === 'string' ? r.frameworkTitle : undefined,
    mode: (r.mode as ObsMode) ?? 'full',
    course: typeof r.course === 'string' ? r.course : '',
    division: typeof r.division === 'string' ? r.division : '',
    pre: { ...base.pre, ...(r.pre as object ?? {}) },
    wrap: { ...base.wrap, ...(r.wrap as object ?? {}) },
    durationMs: typeof r.durationMs === 'number' ? r.durationMs : null,
    notes: Array.isArray(r.notes) ? (r.notes as TwgNote[]) : [],
    categories: [],
    analysis: {},
    checks: (r.checks && typeof r.checks === 'object') ? (r.checks as Record<string, string[]>) : {},
  }

  // Already the current shape.
  if (Array.isArray(r.categories)) {
    data.categories = r.categories as CaptureCategory[]
    data.analysis = (r.analysis && typeof r.analysis === 'object') ? (r.analysis as Record<string, CategoryAnalysis>) : {}
    return data
  }

  // Legacy v1: pillars[] + analysis keyed by pillar key.
  const titleToId = new Map(domains.map((d) => [d.title, d.id]))
  const keyToId = new Map<string, string>()
  for (const p of PILLARS) { const id = titleToId.get(p.name); if (id) keyToId.set(p.key, id) }

  const legacyPillars: string[] = Array.isArray(r.pillars) ? (r.pillars as string[]) : []
  data.categories = legacyPillars.map((k) => {
    const id = keyToId.get(k) ?? k
    const title = domains.find((d) => d.id === id)?.title ?? PILLAR_MAP[k as PillarKey]?.name ?? k
    return { id, title }
  })
  const analysis: Record<string, CategoryAnalysis> = {}
  if (r.analysis && typeof r.analysis === 'object') {
    for (const [k, v] of Object.entries(r.analysis as Record<string, CategoryAnalysis>)) {
      analysis[keyToId.get(k) ?? k] = v
    }
  }
  data.analysis = analysis
  data.notes = data.notes.map((n) => ({
    ...n,
    tags: (n.tags ?? []).map((k) => keyToId.get(k) ?? k),
    spans: (n.spans ?? []).map((s) => ({ ...s, tags: (s.tags ?? []).map((k) => keyToId.get(k) ?? k) })),
  }))
  return data
}

export function formatElapsed(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}
