-- ============================================================
-- GCS PD Platform — Migration: Resource library redesign + PD events
-- Safe to run once on the existing hosted DB (which already has data).
-- Run this whole file in the Supabase SQL editor.
--
-- ⚠️  IMPORTANT: Postgres will not let a newly-added enum value be used
--     in the SAME transaction that added it. If you paste this entire
--     file and get an error like "unsafe use of new value 'website' of
--     enum type resource_type" on the SEED section, just RUN THE FILE
--     A SECOND TIME. The enum additions will already be committed, and
--     the seed section will then succeed. (Everything is guarded so a
--     second run is harmless.)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PART 1 — Schema changes (columns, enum values, indexes, table)
-- ════════════════════════════════════════════════════════════

-- ── resources: new columns ───────────────────────────────────
alter table public.resources add column if not exists cover_image text;
alter table public.resources add column if not exists audience text[] not null default '{}';
alter table public.resources add column if not exists themes   text[] not null default '{}';
alter table public.resources add column if not exists subjects text[] not null default '{}';

-- ── resource_type: new enum values (each guarded) ────────────
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'resource_type' and e.enumlabel = 'website') then
    alter type resource_type add value 'website';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'resource_type' and e.enumlabel = 'blog_post') then
    alter type resource_type add value 'blog_post';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'resource_type' and e.enumlabel = 'pdf') then
    alter type resource_type add value 'pdf';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'resource_type' and e.enumlabel = 'podcast') then
    alter type resource_type add value 'podcast';
  end if;
end $$;

-- ── GIN indexes on the new array columns ─────────────────────
create index if not exists resources_audience_idx on public.resources using gin(audience);
create index if not exists resources_themes_idx   on public.resources using gin(themes);
create index if not exists resources_subjects_idx on public.resources using gin(subjects);

-- ── pd_events table ──────────────────────────────────────────
create table if not exists public.pd_events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  event_type   text,            -- 'Conference' | 'Workshop' | 'Webinar' | 'Local Event' | 'Certificate Program'
  location     text,
  is_virtual   boolean default false,
  start_date   date not null,
  end_date     date,
  url          text,
  cost         numeric(8,2),
  audience     text[] not null default '{}',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists pd_events_start_date_idx on public.pd_events(start_date);

alter table public.pd_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pd_events'
      and policyname = 'Authenticated users can view events'
  ) then
    create policy "Authenticated users can view events"
      on public.pd_events for select
      using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pd_events'
      and policyname = 'Supervisors and admins manage events'
  ) then
    create policy "Supervisors and admins manage events"
      on public.pd_events for all
      using (get_user_role() in ('supervisor', 'admin'))
      with check (get_user_role() in ('supervisor', 'admin'));
  end if;
end $$;


-- ════════════════════════════════════════════════════════════
-- PART 2 — Seed data
--
-- ⚠️  If you got an "unsafe use of new value" error above, the enum
--     values are now committed — RUN THE FILE AGAIN and this section
--     will succeed. All inserts use ON CONFLICT DO NOTHING, so
--     re-running never duplicates rows.
-- ════════════════════════════════════════════════════════════

-- ── Seed: resources ──────────────────────────────────────────
insert into public.resources
  (id, title, description, url, type, cover_image, audience, themes, subjects, tags, submitted_by, is_approved)
values
  (
    'bb000000-0000-0000-0000-000000000001',
    'The Writing Revolution',
    'A method that turns writing instruction into a schoolwide engine for content learning and critical thinking, grounded in the Hochman Method.',
    'https://www.thewritingrevolution.org/',
    'website',
    'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=60',
    array['Lower School','Middle School','High School','Faculty'],
    array['Writing','Curriculum Design','Assessment'],
    array['English','Interdisciplinary'],
    array['Writing','Curriculum Design','Assessment'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000002',
    'Responsive Classroom',
    'Evidence-based practices for creating safe, joyful, and engaging classrooms and school communities through social-emotional learning.',
    'https://www.responsiveclassroom.org/',
    'website',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=60',
    array['Early Childhood','Lower School','Faculty'],
    array['Classroom Management','Social-Emotional Learning'],
    array['Interdisciplinary'],
    array['Classroom Management','Social-Emotional Learning'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000003',
    'Building Thinking Classrooms in Mathematics',
    'Peter Liljedahl''s 14 practices for maximizing student thinking, from vertical non-permanent surfaces to visibly random groupings.',
    'https://buildingthinkingclassrooms.com/',
    'book',
    'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=60',
    array['Middle School','High School','Faculty'],
    array['Curriculum Design','Differentiation','Assessment'],
    array['Mathematics'],
    array['Curriculum Design','Differentiation','Assessment'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000004',
    'Nearpod: Interactive Lessons',
    'An EdTech platform for building interactive lessons, formative checks, and student-paced activities across every division.',
    'https://nearpod.com/',
    'tool',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=60',
    array['Lower School','Middle School','High School','Technology','Faculty'],
    array['AI & EdTech','Assessment','Differentiation'],
    array['Interdisciplinary','Computer Science'],
    array['AI & EdTech','Assessment','Differentiation'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000005',
    'Culturally Responsive Teaching & The Brain (Webinar)',
    'Zaretta Hammond unpacks the neuroscience of learning and practical moves for equitable, culturally responsive instruction.',
    'https://crtandthebrain.com/',
    'webinar',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=60',
    array['Faculty','Administration','Middle School','High School'],
    array['DEI','Curriculum Design','Social-Emotional Learning'],
    array['Interdisciplinary','History & Social Studies'],
    array['DEI','Curriculum Design','Social-Emotional Learning'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000006',
    'Google Certified Educator Level 1',
    'A certification path covering Google Workspace for Education tools to boost classroom productivity and collaboration.',
    'https://edu.google.com/intl/ALL_us/for-educators/certification-programs/product-expertise/',
    'certificate',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=60',
    array['Faculty','Staff','Technology'],
    array['AI & EdTech','Curriculum Design'],
    array['Computer Science','Interdisciplinary'],
    array['AI & EdTech','Curriculum Design'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000007',
    'Math for Love: Pedagogy Blog',
    'Dan Finkel''s writing on playful, thinking-rich mathematics — problems, games, and routines that build genuine number sense.',
    'https://mathforlove.com/blog/',
    'blog_post',
    'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=60',
    array['Early Childhood','Lower School','Middle School','Faculty'],
    array['Project-Based Learning','Differentiation','Curriculum Design'],
    array['Mathematics'],
    array['Project-Based Learning','Differentiation','Curriculum Design'],
    'aa000000-0000-0000-0000-000000000001', true
  ),
  (
    'bb000000-0000-0000-0000-000000000008',
    'The Principal Center Radio (Leadership Podcast)',
    'Justin Baeder interviews education leaders on instructional leadership, feedback, and building a culture of professional growth.',
    'https://www.principalcenter.com/radio/',
    'podcast',
    'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=800&q=60',
    array['Administration','Faculty'],
    array['Leadership','Family Engagement','Assessment'],
    array['Interdisciplinary'],
    array['Leadership','Family Engagement','Assessment'],
    'aa000000-0000-0000-0000-000000000001', true
  )
on conflict (id) do nothing;

-- ── Seed: pd_events (July–December 2026) ─────────────────────
insert into public.pd_events
  (id, title, description, event_type, location, is_virtual, start_date, end_date, url, cost, audience, created_by)
values
  (
    'cc000000-0000-0000-0000-000000000001',
    'ISTELive 26',
    'The premier edtech conference for teaching and learning with technology, featuring workshops, keynotes, and an enormous expo.',
    'Conference',
    'San Antonio, TX',
    false,
    '2026-06-28', '2026-07-01',
    'https://conference.iste.org/',
    899.00,
    array['Faculty','Technology','Administration'],
    'aa000000-0000-0000-0000-000000000001'
  ),
  (
    'cc000000-0000-0000-0000-000000000002',
    'Responsive Classroom Summer Institute',
    'A four-day immersive institute on the core practices of Responsive Classroom for elementary and middle-grade educators.',
    'Certificate Program',
    'Boston, MA',
    false,
    '2026-08-10', '2026-08-13',
    'https://www.responsiveclassroom.org/professional-development/',
    1195.00,
    array['Early Childhood','Lower School','Middle School','Faculty'],
    'aa000000-0000-0000-0000-000000000001'
  ),
  (
    'cc000000-0000-0000-0000-000000000003',
    'Google Educator Bootcamp (NYC)',
    'A hands-on local bootcamp to prepare for the Google Certified Educator Level 1 & 2 exams.',
    'Workshop',
    'Manhattan, NY',
    false,
    '2026-09-19', null,
    'https://edu.google.com/',
    149.00,
    array['Faculty','Staff','Technology'],
    'aa000000-0000-0000-0000-000000000001'
  ),
  (
    'cc000000-0000-0000-0000-000000000004',
    'NYSAIS Emerging Leaders Workshop',
    'A New York State Association of Independent Schools workshop for aspiring and early-career school leaders.',
    'Workshop',
    'Rye, NY',
    false,
    '2026-10-15', '2026-10-16',
    'https://www.nysais.org/',
    375.00,
    array['Faculty','Administration'],
    'aa000000-0000-0000-0000-000000000001'
  ),
  (
    'cc000000-0000-0000-0000-000000000005',
    'NAIS People of Color Conference (PoCC)',
    'The flagship NAIS conference providing a safe space for leadership, professional development, and networking for people of color.',
    'Conference',
    'Denver, CO',
    false,
    '2026-12-02', '2026-12-05',
    'https://pocc.nais.org/',
    1050.00,
    array['Faculty','Staff','Administration'],
    'aa000000-0000-0000-0000-000000000001'
  ),
  (
    'cc000000-0000-0000-0000-000000000006',
    'Differentiation in the Diverse Classroom (Webinar)',
    'A virtual session on practical strategies for differentiating instruction across a wide range of learners.',
    'Webinar',
    null,
    true,
    '2026-11-05', null,
    'https://www.ascd.org/',
    0.00,
    array['Faculty','Lower School','Middle School','High School'],
    'aa000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;
