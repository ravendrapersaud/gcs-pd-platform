-- ============================================================
-- Seed: NEC26 — New Employee Cohort (2026–27)
-- Populates the cohort, its shared workspace, the session schedule, and a
-- starter onboarding checklist from the "NEC26: Schedule" doc. Idempotent
-- (fixed UUIDs + on conflict do nothing). Does NOT add members — Kellyann
-- curates the roster — and does NOT add 1:1 / office-hours slots (Ravi & co.
-- post those with real times). Safe to re-run.
-- ============================================================

-- Shared workspace first (cohort.workspace_id references it).
insert into public.workspaces (id, name, description, kind, created_by)
values (
  'a0c00000-0000-4e26-8000-0000000000ff',
  'NEC26 — New Employee Cohort',
  'Shared space for the NEC26 new-faculty cohort.',
  'cohort', null
)
on conflict (id) do nothing;

-- The cohort. created_by = Kellyann McEnery (kmcenery@), the coordinator.
insert into public.cohorts (id, name, school_year, description, is_active, start_date, end_date, workspace_id, created_by)
values (
  'a0c00000-0000-4e26-8000-000000000026',
  'NEC26 — New Employee Cohort',
  '2026–27',
  'Professional development, support, and access to the administrative team for our newest teaching faculty.',
  true,
  '2026-08-24',
  '2027-06-12',
  'a0c00000-0000-4e26-8000-0000000000ff',
  '78658355-f727-44c0-9c19-a3b9eb6f11a7'
)
on conflict (id) do nothing;

-- ── Sessions (from the schedule doc) ─────────────────────────
-- Times/rooms live in `location` (both campuses shown) so members see them;
-- most sessions run at both campuses (campus = null), except where noted.
insert into public.cohort_sessions
  (id, cohort_id, title, session_date, location, campus, presenter, prep_notes, sort_order)
values
  ('a0c00000-0000-4e26-8000-000000000101','a0c00000-0000-4e26-8000-000000000026',
   'Folio Setup & Goals', '2026-09-18',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:10 PM, Conference Room', null,
   'Kim Chaloner',
   'Sign in to GTT (optional) and log into your Folio account.', 1),

  ('a0c00000-0000-4e26-8000-000000000102','a0c00000-0000-4e26-8000-000000000026',
   'Report & Comment Writing; Curriculum Map Review', '2026-09-25',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:10 PM, Conference Room', null,
   'Kim Chaloner',
   'Optional — bring questions about report writing, especially comments.', 2),

  ('a0c00000-0000-4e26-8000-000000000103','a0c00000-0000-4e26-8000-000000000026',
   'Student Relationships', '2026-10-16',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:10 PM, Conference Room', null,
   'Mel / Kim R',
   'No prep — share questions about student relationships ahead if you like.', 3),

  ('a0c00000-0000-4e26-8000-000000000104','a0c00000-0000-4e26-8000-000000000026',
   'Student Support; Grading & Report Check-In', '2026-10-30',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:00 PM, Conference Room', null,
   'Saara Mahjouri / Kim',
   'No prep — share questions ahead if you like.', 4),

  ('a0c00000-0000-4e26-8000-000000000105','a0c00000-0000-4e26-8000-000000000026',
   'Grace Culture', '2026-11-13',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:00 PM, Conference Room', null,
   'Robbie',
   'No prep — share questions about Grace’s mission or Teaching with Grace ahead if you like.', 5),

  ('a0c00000-0000-4e26-8000-000000000106','a0c00000-0000-4e26-8000-000000000026',
   'OCE Work', '2026-12-04',
   '12:20–1:00 PM, Conference Room', '46',
   null,
   'Follow-up from opening meetings and the professional development day.', 6),

  ('a0c00000-0000-4e26-8000-000000000107','a0c00000-0000-4e26-8000-000000000026',
   'Holiday Party Pre-Party', '2026-12-17',
   'HS Auditorium', null,
   null,
   'Bring nothing but joy and a desire for raffle gifts.', 7),

  ('a0c00000-0000-4e26-8000-000000000108','a0c00000-0000-4e26-8000-000000000026',
   'Science of Learning', '2027-01-15',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:00 PM, Conference Room', null,
   'Kim',
   null, 8),

  ('a0c00000-0000-4e26-8000-000000000109','a0c00000-0000-4e26-8000-000000000026',
   'Small-Group Check-In: Seeking Support as an Employee; Goals Check-In', '2027-02-05',
   '86th: 7:45–8:15 AM, Paint St Rm 180 · 46th: 12:20–1:00 PM, Conference Room', null,
   'Kim Chaloner',
   'No prep — the group will help design upcoming topics. Please be present!', 9)
on conflict (id) do nothing;

-- ── Starter onboarding checklist ─────────────────────────────
insert into public.cohort_tasks
  (id, cohort_id, title, description, link_url, required, sort_order)
values
  ('a0c00000-0000-4e26-8000-000000000201','a0c00000-0000-4e26-8000-000000000026',
   'Complete your onboarding materials', 'Finish the digital onboarding materials shared with you.',
   null, true, 1),

  ('a0c00000-0000-4e26-8000-000000000202','a0c00000-0000-4e26-8000-000000000026',
   'Log into your Folio account', null, null, true, 2),

  ('a0c00000-0000-4e26-8000-000000000203','a0c00000-0000-4e26-8000-000000000026',
   'Sign in to GTT', 'Optional, but handy for cohort materials.',
   'https://docs.google.com/presentation/d/1rJxFW4CFfChkaPSAU-5NZzvoINJ_hay6/edit', false, 3),

  ('a0c00000-0000-4e26-8000-000000000204','a0c00000-0000-4e26-8000-000000000026',
   'Read the First-Semester Walk-Through', null,
   'https://docs.google.com/document/d/1eLrvuuGlGt89bk4y9asO1RqE-hfbgMbTEqazPccU3Zc/edit', false, 4),

  ('a0c00000-0000-4e26-8000-000000000205','a0c00000-0000-4e26-8000-000000000026',
   'Read “Teaching with Grace”', null,
   'https://docs.google.com/document/d/11fYrImV4g5BOnWuhOmLpilAnj3u2p29L4FM-oZIvU94/edit', false, 5),

  ('a0c00000-0000-4e26-8000-000000000206','a0c00000-0000-4e26-8000-000000000026',
   'Review the opening-weeks documents', null,
   'https://docs.google.com/document/d/1wjZwnApSRon-QTHyGRE39NLUOHHOFRKkR8E8_IknSxo/edit', false, 6)
on conflict (id) do nothing;
