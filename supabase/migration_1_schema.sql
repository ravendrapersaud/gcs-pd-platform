-- ============================================================
-- GCS PD Platform — Migration STEP 1 of 2: Schema
-- Run this FIRST, on its own, in the Supabase SQL editor.
-- It adds columns, the new enum values, indexes, and the
-- pd_events table. Wait for it to finish (Success), THEN run
-- migration_2_seed.sql. Splitting is required because Postgres
-- won't let new enum values be used until they're committed.
-- ============================================================

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
