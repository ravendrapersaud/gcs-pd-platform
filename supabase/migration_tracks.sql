-- Staff development "track": faculty | student_support | institutional.
-- This is the development axis (what frames a person's portfolio), NOT
-- seniority — a CTO and an IT technician share the Institutional track but
-- differ by profiles.roles[] (Senior Administrator vs. Team Lead). The track
-- is normally DERIVED from department (see lib/tracks.ts); this column is the
-- per-person override (null = derive). Idempotent.

-- ── profiles.track: per-person override (null = derive from department) ──
alter table public.profiles
  add column if not exists track text
    check (track in ('faculty', 'student_support', 'institutional'));

comment on column public.profiles.track is
  'Development-track override (faculty|student_support|institutional). NULL = derive from department via lib/tracks.ts. Separate from roles[]/role seniority.';

-- ── app_settings: which departments are student-facing support ──────────
-- One department per line. Blank = lib/tracks.ts DEFAULT_STUDENT_SUPPORT_DEPARTMENTS.
insert into public.app_settings (key, value)
values (
  'student_support_departments',
  E'Health Services\nCounseling\nLearning Support'
)
on conflict (key) do nothing;
