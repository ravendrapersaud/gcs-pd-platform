-- Event sources + scraped-event plumbing for the PD calendar.
-- Adds a configurable list of sources (managed in Settings), a weekly scraper
-- target, a review-queue status on events, and dedup columns so a re-scrape
-- updates rather than duplicates. Idempotent.

-- ── event_sources: the admin-managed list of sites to scrape ──
create table if not exists public.event_sources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  url           text not null,
  kind          text not null default 'auto',  -- 'auto' | 'ics' | 'html'
  is_active     boolean not null default true,
  default_event_type text,                      -- tag imported events, optional
  default_audience   text[] not null default '{}',
  last_run_at   timestamptz,
  last_status   text,                           -- 'ok' | 'error' | 'skipped'
  last_count    int,
  last_error    text,
  added_by      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.event_sources enable row level security;

-- Admins manage the source list (Settings is admin-only).
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='event_sources'
      and policyname='Admins manage event sources'
  ) then
    create policy "Admins manage event sources"
      on public.event_sources for all
      using (get_user_role() = 'admin')
      with check (get_user_role() = 'admin');
  end if;
end $$;

-- ── pd_events: scraping + review-queue columns ───────────────
alter table public.pd_events add column if not exists status text not null default 'published'; -- 'published' | 'pending' | 'rejected'
alter table public.pd_events add column if not exists source_id uuid references public.event_sources(id) on delete set null;
alter table public.pd_events add column if not exists external_key text;   -- stable id from the source, for dedup
alter table public.pd_events add column if not exists is_auto boolean not null default false;
alter table public.pd_events add column if not exists last_seen_at timestamptz;

-- Re-scrape upserts on (source, external_key); only for scraped rows.
create unique index if not exists pd_events_source_key_uniq
  on public.pd_events(source_id, external_key)
  where source_id is not null and external_key is not null;

create index if not exists pd_events_status_idx on public.pd_events(status);

-- Everyone sees published events; supervisors/admins also see the pending
-- review queue. Replaces the old "any authenticated user sees all" policy.
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='Authenticated users can view events'
  ) then
    drop policy "Authenticated users can view events" on public.pd_events;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='View published events or review queue'
  ) then
    create policy "View published events or review queue"
      on public.pd_events for select
      using (
        auth.uid() is not null
        and (
          coalesce(status, 'published') = 'published'
          or get_user_role() in ('supervisor', 'admin')
        )
      );
  end if;
end $$;
