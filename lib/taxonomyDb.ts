// ── DB-backed taxonomy helpers ───────────────────────────────────
// Terms (audiences/subjects/themes) live in the taxonomy_terms table
// and are admin-manageable (Dashboard → Admin → Settings). This module
// is intentionally pure (no Supabase imports): pages fetch the rows
// themselves (select *, order by sort_order) and pass them to termsFor.
// When rows are missing/empty for a category, we fall back to the
// hardcoded constants in lib/taxonomy.ts so nothing breaks before the
// migration has been run.

import { AUDIENCES, SUBJECTS, THEMES } from './taxonomy'

export type TaxonomyCategory = 'audience' | 'subject' | 'theme'

export interface TaxonomyTerm {
  id: string
  category: TaxonomyCategory
  label: string
  is_active: boolean
  sort_order: number
}

const FALLBACKS: Record<TaxonomyCategory, readonly string[]> = {
  audience: AUDIENCES,
  subject: SUBJECTS,
  theme: THEMES,
}

// Ordered labels for one category. Active terms only by default
// (retired terms stop being selectable but stored tags still display,
// since content stores tags as plain text).
export function termsFor(
  rows: TaxonomyTerm[] | null | undefined,
  category: TaxonomyCategory,
  opts?: { includeInactive?: boolean }
): string[] {
  const matching = (rows ?? []).filter((r) => r.category === category)
  if (matching.length === 0) return [...FALLBACKS[category]]
  const visible = opts?.includeInactive ? matching : matching.filter((r) => r.is_active)
  return visible
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((r) => r.label)
}
