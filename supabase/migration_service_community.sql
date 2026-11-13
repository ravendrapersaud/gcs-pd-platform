-- Service & Community log (v1): a qualitative, self-owned record of community
-- engagement — committees, affinity/cultural groups, focus groups, events (AV for
-- the play), one-off volunteering, etc. No hours, no points, no endorsement (all
-- cut in review). Shared with the person's supervisor + designated admins by
-- default; the owner can mark an entry private. Admins may log on a person's
-- behalf (people forget what they do). RLS reuses the division-aware access
-- helpers from migration_checkin_admin_scope.sql. Idempotent.

-- ── 1. Service types join the admin-managed taxonomy ─────────────────
alter table public.taxonomy_terms drop constraint if exists taxonomy_terms_category_check;
alter table public.taxonomy_terms
  add constraint taxonomy_terms_category_check
  check (category in ('audience', 'subject', 'theme', 'service_type'));

insert into public.taxonomy_terms (category, label, sort_order) values
  ('service_type', 'Committee', 10),
  ('service_type', 'Affinity / Cultural group', 20),
  ('service_type', 'Focus group / Task force', 30),
  ('service_type', 'Event / Production', 40),
  ('service_type', 'Coaching / Club', 50),
  ('service_type', 'One-off volunteer', 60),
  ('service_type', 'Service learning', 70),
  ('service_type', 'Trip / Chaperoning', 80),
  ('service_type', 'Admissions help', 90),
  ('service_type', 'Other', 100)
on conflict (category, label) do nothing;

-- ── 2. service_entries ───────────────────────────────────────────────
create table if not exists public.service_entries (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references public.profiles(id) on delete cascade,  -- whose contribution
  created_by        uuid references public.profiles(id) on delete set null,          -- owner, or an admin on their behalf
  title             text not null,
  service_type      text,                                                            -- taxonomy label
  role              text,                                                            -- member / chair / volunteer…
  timeframe         text not null default 'school_year' check (timeframe in ('ongoing', 'school_year', 'one_off')),
  on_date           date,                                                            -- optional, for a one-off
  reflection        text,
  link              text,
  visibility        text not null default 'shared' check (visibility in ('shared', 'private')),
  school_year_start int not null,                                                    -- year-scoped like projects
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists service_entries_subject_idx on public.service_entries(subject_id, school_year_start);
alter table public.service_entries enable row level security;

-- ── 3. RLS (reuses can_access_checkin / is_checkin_admin) ────────────
do $$ begin
  -- Read: owner always; shared entries also to supervisor(s) + designated admins.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_entries' and policyname='Read own or shared service entries') then
    create policy "Read own or shared service entries"
      on public.service_entries for select
      using (
        subject_id = auth.uid()
        or (visibility = 'shared' and public.can_access_checkin(subject_id))
      );
  end if;

  -- Create: the owner, or a designated admin on their behalf. created_by = caller.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_entries' and policyname='Add service entries for self or as admin') then
    create policy "Add service entries for self or as admin"
      on public.service_entries for insert
      with check (
        created_by = auth.uid()
        and (subject_id = auth.uid() or public.is_checkin_admin(subject_id))
      );
  end if;

  -- Update: owner or designated admin.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_entries' and policyname='Update own or admin service entries') then
    create policy "Update own or admin service entries"
      on public.service_entries for update
      using (subject_id = auth.uid() or public.is_checkin_admin(subject_id))
      with check (subject_id = auth.uid() or public.is_checkin_admin(subject_id));
  end if;

  -- Delete: owner or designated admin.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='service_entries' and policyname='Delete own or admin service entries') then
    create policy "Delete own or admin service entries"
      on public.service_entries for delete
      using (subject_id = auth.uid() or public.is_checkin_admin(subject_id));
  end if;
end $$;
