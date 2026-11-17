-- ============================================================
-- GCS PD Platform — PD fund source & admin-entered costs
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Lets a cost be recorded as PD without necessarily drawing from the
-- employee's personal $3,100 allotment (presenter stipends, department /
-- school / grant funding, etc.), and lets a fund manager (Kellyann, Kim)
-- add incidental costs (per-diem, meals, lodging) to anyone's record after
-- the fact. Only fund_source='personal' counts against the allotment.
--
-- Adds: funding_requests.fund_source / category / created_by / admin_entered,
-- profiles.can_manage_funds, the can_manage_funds() helper, and RLS so fund
-- managers can add/edit/remove cost lines for any employee.
-- ============================================================

-- ── 1. New columns on funding_requests ──────────────────────
-- fund_source defaults to 'personal' so every EXISTING approved request keeps
-- counting against the allotment exactly as before — no behavior change until
-- someone sets a different source.
alter table public.funding_requests
  add column if not exists fund_source text not null default 'personal'
    check (fund_source in ('personal', 'department', 'school', 'grant', 'external', 'presenter_stipend'));

-- Optional cost category for the line (registration, travel, lodging, per-diem…).
alter table public.funding_requests
  add column if not exists category text;

-- Who entered the line (the fund manager, when admin-entered), distinct from
-- user_id (whose fund it concerns) and reviewed_by (who approved).
alter table public.funding_requests
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- True when a fund manager entered this directly (pre-approved), rather than it
-- coming through the employee's request flow.
alter table public.funding_requests
  add column if not exists admin_entered boolean not null default false;

-- ── 2. Grantable fund-management permission on profiles ─────
-- Mirrors can_approve_events / can_manage_cohorts. Admins always qualify.
alter table public.profiles
  add column if not exists can_manage_funds boolean not null default false;

-- ── 3. Helper ───────────────────────────────────────────────
create or replace function public.can_manage_funds()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(public.get_user_role() = 'admin', false)
      or coalesce((select p.can_manage_funds from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.can_manage_funds() to authenticated;

-- ── 4. RLS: fund managers can add / edit / remove any cost line ──
-- (The existing "Users create own", "Users see own", and
-- "Admins and assigned supervisors update" policies stay in place.)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='funding_requests'
    and policyname='Fund managers create funding for anyone') then
    create policy "Fund managers create funding for anyone"
      on public.funding_requests for insert
      with check (public.can_manage_funds());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='funding_requests'
    and policyname='Fund managers update any funding') then
    create policy "Fund managers update any funding"
      on public.funding_requests for update
      using (public.can_manage_funds()) with check (public.can_manage_funds());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='funding_requests'
    and policyname='Fund managers delete any funding') then
    create policy "Fund managers delete any funding"
      on public.funding_requests for delete
      using (public.can_manage_funds());
  end if;
end $$;
