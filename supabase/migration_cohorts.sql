-- ============================================================
-- GCS PD Platform — New Faculty Cohorts (onboarding)
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- A cohort is an annual onboarding group for new teaching faculty
-- (the "NEC26" doc). It carries a curated roster, a shared schedule
-- of sessions, an onboarding checklist, bookable 1:1 / office-hours /
-- observation-walk slots, and an auto-provisioned shared workspace
-- kept in sync with the roster.
--
-- Adds: profiles.can_manage_cohorts, cohorts, cohort_members,
-- cohort_sessions, cohort_tasks, cohort_task_completions,
-- cohort_slots, cohort_slot_signups, the 'cohort' workspace kind,
-- SECURITY DEFINER helpers + RPCs, and RLS.
-- ============================================================

-- ── 1. Grantable management permission on profiles ───────────
-- Lets a non-admin coordinator (e.g. Kellyann, who today is an admin)
-- run cohorts. Mirrors can_create_workspaces / can_approve_events.
alter table public.profiles
  add column if not exists can_manage_cohorts boolean not null default false;

-- ── 2. Allow kind='cohort' on workspaces (mirrors the 'department' add) ──
alter table public.workspaces drop constraint if exists workspaces_kind_check;
alter table public.workspaces
  add constraint workspaces_kind_check check (kind in ('team', 'committee', 'department', 'cohort'));

-- ── 3. Tables ─────────────────────────────────────────────────
create table if not exists public.cohorts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                 -- e.g. 'NEC26 — New Employee Cohort'
  school_year  text,                          -- e.g. '2026–27'
  description  text,
  is_active    boolean not null default true,
  start_date   date,
  end_date     date,
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists public.cohort_members (
  cohort_id   uuid references public.cohorts(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('member', 'facilitator')),
  added_by    uuid references public.profiles(id) on delete set null,
  added_at    timestamptz default now(),
  primary key (cohort_id, user_id)
);

create table if not exists public.cohort_sessions (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid references public.cohorts(id) on delete cascade,
  title        text not null,                 -- the topic
  description  text,
  prep_notes   text,                          -- "Preparation Needed"
  session_date date,
  start_time   time,
  end_time     time,
  location     text,
  campus       text check (campus is null or campus in ('86', '46')),  -- null = both
  presenter    text,                          -- free text, e.g. 'Kim C'
  resource_url text,
  sort_order   int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists public.cohort_tasks (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid references public.cohorts(id) on delete cascade,
  session_id  uuid references public.cohort_sessions(id) on delete set null,  -- null = general task
  title       text not null,
  description text,
  link_url    text,
  due_date    date,
  required    boolean not null default false,
  sort_order  int not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists public.cohort_task_completions (
  task_id      uuid references public.cohort_tasks(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key (task_id, user_id)
);

create table if not exists public.cohort_slots (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid references public.cohorts(id) on delete cascade,
  host_id    uuid references public.profiles(id) on delete set null,  -- who offers the time
  kind       text not null default 'one_on_one'
               check (kind in ('one_on_one', 'office_hours', 'observation_walk')),
  title      text,
  slot_date  date,
  start_time time,
  end_time   time,
  location   text,
  capacity   int not null default 1,
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.cohort_slot_signups (
  slot_id    uuid references public.cohort_slots(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  note       text,                            -- member's question / what to focus on
  created_at timestamptz default now(),
  primary key (slot_id, user_id)
);

create index if not exists idx_cohort_members_cohort on public.cohort_members(cohort_id);
create index if not exists idx_cohort_members_user on public.cohort_members(user_id);
create index if not exists idx_cohort_sessions_cohort on public.cohort_sessions(cohort_id);
create index if not exists idx_cohort_tasks_cohort on public.cohort_tasks(cohort_id);
create index if not exists idx_cohort_tasks_session on public.cohort_tasks(session_id);
create index if not exists idx_cohort_task_completions_user on public.cohort_task_completions(user_id);
create index if not exists idx_cohort_slots_cohort on public.cohort_slots(cohort_id);
create index if not exists idx_cohort_slot_signups_user on public.cohort_slot_signups(user_id);

-- ── 4. Helper functions (security definer, avoid RLS recursion) ──
create or replace function public.can_manage_cohorts()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(public.get_user_role() = 'admin', false)
      or coalesce((select p.can_manage_cohorts from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_cohort_member(c uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.cohort_members
    where cohort_id = c and user_id = auth.uid()
  );
$$;

create or replace function public.is_cohort_facilitator(c uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.cohort_members
    where cohort_id = c and user_id = auth.uid() and member_role = 'facilitator'
  );
$$;

-- "Manager" of a cohort = a global cohort manager (admin / flag) OR a
-- facilitator of this specific cohort.
create or replace function public.is_cohort_manager(c uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_manage_cohorts() or public.is_cohort_facilitator(c);
$$;

-- ── 5. RPCs: provision + sync the cohort's shared workspace ───
-- Mirror sync_workspace_members / ensure_department_workspace. The cohort
-- workspace membership exactly tracks the roster (added_via='rule'), with
-- facilitators as managers.
create or replace function public.sync_cohort_workspace(c uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  n  int := 0;
begin
  select workspace_id into ws from public.cohorts where id = c;
  if ws is null then
    return 0;
  end if;

  -- Add/refresh a membership row for everyone on the roster.
  insert into public.workspace_members (workspace_id, user_id, is_manager, added_via)
  select ws, m.user_id, (m.member_role = 'facilitator'), 'rule'
  from public.cohort_members m
  where m.cohort_id = c
  on conflict (workspace_id, user_id)
  do update set is_manager = excluded.is_manager;

  -- Drop rule-added members who are no longer on the roster (leave manual rows).
  delete from public.workspace_members wm
  where wm.workspace_id = ws
    and wm.added_via = 'rule'
    and not exists (
      select 1 from public.cohort_members m
      where m.cohort_id = c and m.user_id = wm.user_id
    );

  select count(*) into n from public.cohort_members where cohort_id = c;
  return n;
end;
$$;

create or replace function public.ensure_cohort_workspace(c uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  co public.cohorts%rowtype;
  ws uuid;
begin
  if not public.is_cohort_manager(c) then
    raise exception 'Not permitted to manage this cohort';
  end if;

  select * into co from public.cohorts where id = c;
  if not found then
    return null;
  end if;

  ws := co.workspace_id;
  if ws is null then
    insert into public.workspaces (name, description, kind, created_by)
    values (co.name, 'Shared space for the ' || co.name || ' cohort.', 'cohort', null)
    returning id into ws;
    update public.cohorts set workspace_id = ws where id = c;
  end if;

  perform public.sync_cohort_workspace(c);
  return ws;
end;
$$;

-- Per-slot booked counts for a cohort, WITHOUT exposing who signed up or their
-- notes. Lets a member see "2/3 booked" / remaining capacity while signup rows
-- themselves stay private to the signer, the host, and managers.
create or replace function public.cohort_slot_counts(c uuid)
returns table(slot_id uuid, taken bigint)
language sql security definer stable set search_path = public as $$
  select sg.slot_id, count(*)::bigint
  from public.cohort_slot_signups sg
  join public.cohort_slots s on s.id = sg.slot_id
  where s.cohort_id = c
    and (public.is_cohort_member(c) or public.is_cohort_manager(c))
  group by sg.slot_id;
$$;

grant execute on function public.can_manage_cohorts() to authenticated;
grant execute on function public.cohort_slot_counts(uuid) to authenticated;
grant execute on function public.is_cohort_member(uuid) to authenticated;
grant execute on function public.is_cohort_facilitator(uuid) to authenticated;
grant execute on function public.is_cohort_manager(uuid) to authenticated;
grant execute on function public.sync_cohort_workspace(uuid) to authenticated;
grant execute on function public.ensure_cohort_workspace(uuid) to authenticated;

-- ── 6. RLS ────────────────────────────────────────────────────
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.cohort_sessions enable row level security;
alter table public.cohort_tasks enable row level security;
alter table public.cohort_task_completions enable row level security;
alter table public.cohort_slots enable row level security;
alter table public.cohort_slot_signups enable row level security;

-- cohorts ------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohorts'
    and policyname='Authenticated users can browse cohorts') then
    create policy "Authenticated users can browse cohorts"
      on public.cohorts for select using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohorts'
    and policyname='Cohort managers can create cohorts') then
    create policy "Cohort managers can create cohorts"
      on public.cohorts for insert with check (public.can_manage_cohorts());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohorts'
    and policyname='Cohort managers can update cohorts') then
    create policy "Cohort managers can update cohorts"
      on public.cohorts for update
      using (public.is_cohort_manager(id)) with check (public.is_cohort_manager(id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohorts'
    and policyname='Cohort admins can delete cohorts') then
    create policy "Cohort admins can delete cohorts"
      on public.cohorts for delete using (public.can_manage_cohorts());
  end if;
end $$;

-- cohort_members -----------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_members'
    and policyname='Members and managers can view roster') then
    create policy "Members and managers can view roster"
      on public.cohort_members for select
      using (public.is_cohort_member(cohort_id) or public.is_cohort_manager(cohort_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_members'
    and policyname='Managers manage the roster') then
    create policy "Managers manage the roster"
      on public.cohort_members for all
      using (public.is_cohort_manager(cohort_id))
      with check (public.is_cohort_manager(cohort_id));
  end if;
end $$;

-- cohort_sessions ----------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_sessions'
    and policyname='Members and managers can view sessions') then
    create policy "Members and managers can view sessions"
      on public.cohort_sessions for select
      using (public.is_cohort_member(cohort_id) or public.is_cohort_manager(cohort_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_sessions'
    and policyname='Managers manage sessions') then
    create policy "Managers manage sessions"
      on public.cohort_sessions for all
      using (public.is_cohort_manager(cohort_id))
      with check (public.is_cohort_manager(cohort_id));
  end if;
end $$;

-- cohort_tasks -------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_tasks'
    and policyname='Members and managers can view tasks') then
    create policy "Members and managers can view tasks"
      on public.cohort_tasks for select
      using (public.is_cohort_member(cohort_id) or public.is_cohort_manager(cohort_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_tasks'
    and policyname='Managers manage tasks') then
    create policy "Managers manage tasks"
      on public.cohort_tasks for all
      using (public.is_cohort_manager(cohort_id))
      with check (public.is_cohort_manager(cohort_id));
  end if;
end $$;

-- cohort_task_completions --------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_task_completions'
    and policyname='Own completions and managers can view') then
    create policy "Own completions and managers can view"
      on public.cohort_task_completions for select
      using (
        user_id = auth.uid()
        or exists (select 1 from public.cohort_tasks t
                   where t.id = task_id and public.is_cohort_manager(t.cohort_id))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_task_completions'
    and policyname='Members check off their own tasks') then
    create policy "Members check off their own tasks"
      on public.cohort_task_completions for insert
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.cohort_tasks t
                    where t.id = task_id and public.is_cohort_member(t.cohort_id))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_task_completions'
    and policyname='Members uncheck their own tasks') then
    create policy "Members uncheck their own tasks"
      on public.cohort_task_completions for delete using (user_id = auth.uid());
  end if;
end $$;

-- cohort_slots -------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_slots'
    and policyname='Members and managers can view slots') then
    create policy "Members and managers can view slots"
      on public.cohort_slots for select
      using (public.is_cohort_member(cohort_id) or public.is_cohort_manager(cohort_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_slots'
    and policyname='Managers and hosts manage slots') then
    create policy "Managers and hosts manage slots"
      on public.cohort_slots for all
      using (public.is_cohort_manager(cohort_id) or host_id = auth.uid())
      with check (public.is_cohort_manager(cohort_id) or host_id = auth.uid());
  end if;
end $$;

-- cohort_slot_signups ------------------------------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_slot_signups'
    and policyname='Own signups, hosts, managers can view') then
    create policy "Own signups, hosts, managers can view"
      on public.cohort_slot_signups for select
      using (
        user_id = auth.uid()
        or exists (select 1 from public.cohort_slots s
                   where s.id = slot_id
                     and (public.is_cohort_manager(s.cohort_id) or s.host_id = auth.uid()))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_slot_signups'
    and policyname='Members sign themselves up') then
    create policy "Members sign themselves up"
      on public.cohort_slot_signups for insert
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.cohort_slots s
                    where s.id = slot_id and public.is_cohort_member(s.cohort_id))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cohort_slot_signups'
    and policyname='Own signups and managers can cancel') then
    create policy "Own signups and managers can cancel"
      on public.cohort_slot_signups for delete
      using (
        user_id = auth.uid()
        or exists (select 1 from public.cohort_slots s
                   where s.id = slot_id
                     and (public.is_cohort_manager(s.cohort_id) or s.host_id = auth.uid()))
      );
  end if;
end $$;
