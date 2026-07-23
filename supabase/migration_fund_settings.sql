-- ── PD fund settings migration (idempotent) ─────────────────────────
-- Adds a school-wide key/value settings table (app_settings) plus a
-- per-person PD allotment override column on profiles.
-- Safe to run multiple times.

-- 1. app_settings table
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

-- 2. RLS policies (guarded so re-running doesn't fail)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and policyname = 'Authenticated users can read settings'
  ) then
    create policy "Authenticated users can read settings"
      on public.app_settings for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and policyname = 'Admins can insert settings'
  ) then
    create policy "Admins can insert settings"
      on public.app_settings for insert
      to authenticated
      with check (get_user_role() = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and policyname = 'Admins can update settings'
  ) then
    create policy "Admins can update settings"
      on public.app_settings for update
      to authenticated
      using (get_user_role() = 'admin')
      with check (get_user_role() = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and policyname = 'Admins can delete settings'
  ) then
    create policy "Admins can delete settings"
      on public.app_settings for delete
      to authenticated
      using (get_user_role() = 'admin');
  end if;
end
$$;

-- 3. Seed defaults (dates are MM-DD strings)
insert into public.app_settings (key, value) values
  ('default_pd_allotment', '3100'),
  ('staff_fund_year_start', '07-01'),
  ('faculty_fund_year_start', '08-25')
on conflict (key) do nothing;

-- 4. Per-person allotment override (null = use school default)
alter table public.profiles
  add column if not exists pd_allotment numeric(8,2);
