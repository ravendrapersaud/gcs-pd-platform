-- ── Theme terms for the imported resource categories (idempotent) ────
-- The 'PD and Resource Lists' Google Doc import
-- (import_resources_from_doc.sql) tags resources with six categories
-- that were not in taxonomy_terms, so they never appeared in the theme
-- filters or the tag picker. Add them as active themes, continuing the
-- sort_order sequence from migration_taxonomy.sql (which ends at 11).
-- Mirrors the THEMES constants in lib/taxonomy.ts.
-- Safe to run multiple times.

insert into public.taxonomy_terms (category, label, sort_order) values
  ('theme', 'Teaching Lessons', 12),
  ('theme', 'Designing Courses', 13),
  ('theme', 'Building Relationships', 14),
  ('theme', 'Academic Leadership', 15),
  ('theme', 'Modeling Virtues', 16),
  ('theme', 'Grace Curated Lists', 17)
on conflict (category, label) do nothing;

-- Re-running after someone retired one of these would leave it inactive;
-- this migration's intent is that all six are selectable.
update public.taxonomy_terms
   set is_active = true
 where category = 'theme'
   and label in (
     'Teaching Lessons', 'Designing Courses', 'Building Relationships',
     'Academic Leadership', 'Modeling Virtues', 'Grace Curated Lists'
   )
   and is_active = false;
