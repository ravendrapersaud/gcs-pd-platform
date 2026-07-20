-- ============================================================
-- GCS Professional Development Platform — Schema
-- Apply in Supabase SQL editor (or via supabase db push)
-- ============================================================

-- ── Custom ENUMs ─────────────────────────────────────────────
create type role_type as enum ('staff', 'supervisor', 'admin');

create type resource_type as enum (
  'webinar', 'certificate', 'conference', 'article', 'tool', 'book', 'video', 'other'
);

create type pd_type as enum (
  'workshop', 'conference', 'course', 'webinar', 'book_study',
  'coaching', 'peer_observation', 'self_directed', 'other'
);

create type funding_status as enum ('pending', 'approved', 'denied', 'cancelled');

create type goal_status as enum ('active', 'completed', 'archived', 'paused');

create type obs_type as enum ('formal', 'informal', 'walkthrough', 'self');

-- ── Helper: get current user's role ──────────────────────────
create or replace function get_user_role()
returns role_type
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  first_name    text not null default '',
  last_name     text not null default '',
  role          role_type not null default 'staff',
  title         text,
  division      text,
  department    text,
  employee_id   text unique,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can insert profiles"
  on public.profiles for insert
  with check (get_user_role() = 'admin');

create policy "Service role can insert profiles"
  on public.profiles for insert
  with check (auth.role() = 'service_role');

-- ── supervisor_assignments ────────────────────────────────────
create table if not exists public.supervisor_assignments (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(staff_id, supervisor_id)
);

alter table public.supervisor_assignments enable row level security;

create policy "Authenticated users can view assignments"
  on public.supervisor_assignments for select
  using (auth.uid() is not null);

create policy "Supervisors and admins can manage assignments"
  on public.supervisor_assignments for all
  using (get_user_role() in ('supervisor', 'admin'));

-- ── resources ─────────────────────────────────────────────────
create table if not exists public.resources (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  url           text,
  file_url      text,
  type          resource_type not null default 'other',
  tags          text[] not null default '{}',
  submitted_by  uuid references public.profiles(id) on delete set null,
  is_approved   boolean not null default true,
  created_at    timestamptz not null default now()
);

create index on public.resources(type);
create index on public.resources(is_approved);
create index on public.resources using gin(tags);

alter table public.resources enable row level security;

create policy "All users see approved resources"
  on public.resources for select
  using (auth.uid() is not null and is_approved = true);

create policy "Users can submit resources"
  on public.resources for insert
  with check (auth.uid() = submitted_by);

create policy "Admins manage resources"
  on public.resources for all
  using (get_user_role() = 'admin');

-- ── resource_favorites ────────────────────────────────────────
create table if not exists public.resource_favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id, resource_id)
);

alter table public.resource_favorites enable row level security;

create policy "Users manage own favorites"
  on public.resource_favorites for all
  using (auth.uid() = user_id);

-- ── goals ─────────────────────────────────────────────────────
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  due_date      date,
  progress_pct  int not null default 0 check (progress_pct between 0 and 100),
  status        goal_status not null default 'active',
  created_at    timestamptz not null default now()
);

create index on public.goals(owner_id);
create index on public.goals(status);

alter table public.goals enable row level security;

create policy "Users see own goals or collaborated goals"
  on public.goals for select
  using (
    auth.uid() = owner_id
    or auth.uid() in (
      select user_id from public.goal_collaborators where goal_id = goals.id
    )
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Users can create goals"
  on public.goals for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update own goals"
  on public.goals for update
  using (auth.uid() = owner_id or get_user_role() in ('supervisor', 'admin'));

create policy "Owners can delete own goals"
  on public.goals for delete
  using (auth.uid() = owner_id or get_user_role() = 'admin');

-- ── goal_collaborators ────────────────────────────────────────
create table if not exists public.goal_collaborators (
  goal_id   uuid not null references public.goals(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (goal_id, user_id)
);

alter table public.goal_collaborators enable row level security;

create policy "Users can view collaborators on visible goals"
  on public.goal_collaborators for select
  using (auth.uid() is not null);

create policy "Goal owners can manage collaborators"
  on public.goal_collaborators for all
  using (
    auth.uid() in (select owner_id from public.goals where id = goal_id)
    or get_user_role() = 'admin'
  );

-- ── goal_updates ──────────────────────────────────────────────
create table if not exists public.goal_updates (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.goals(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  content       text not null,
  progress_pct  int check (progress_pct between 0 and 100),
  created_at    timestamptz not null default now()
);

create index on public.goal_updates(goal_id);

alter table public.goal_updates enable row level security;

create policy "Users can view updates on visible goals"
  on public.goal_updates for select
  using (auth.uid() is not null);

create policy "Users can add updates"
  on public.goal_updates for insert
  with check (auth.uid() = author_id);

-- ── pd_activities ─────────────────────────────────────────────
create table if not exists public.pd_activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  type          pd_type not null default 'other',
  activity_date date not null,
  hours         numeric(4,1) not null check (hours > 0),
  notes         text,
  verified      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index on public.pd_activities(user_id);
create index on public.pd_activities(activity_date);

alter table public.pd_activities enable row level security;

create policy "Users see own pd activities"
  on public.pd_activities for select
  using (
    auth.uid() = user_id
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Users insert own activities"
  on public.pd_activities for insert
  with check (auth.uid() = user_id);

create policy "Users update own activities; supervisors verify"
  on public.pd_activities for update
  using (auth.uid() = user_id or get_user_role() in ('supervisor', 'admin'));

-- ── funding_requests ──────────────────────────────────────────
create table if not exists public.funding_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  pd_activity_id  uuid references public.pd_activities(id) on delete set null,
  title           text not null,
  amount          numeric(8,2) not null check (amount > 0),
  description     text,
  status          funding_status not null default 'pending',
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index on public.funding_requests(user_id);
create index on public.funding_requests(status);

alter table public.funding_requests enable row level security;

create policy "Users see own funding requests"
  on public.funding_requests for select
  using (
    auth.uid() = user_id
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Users create own funding requests"
  on public.funding_requests for insert
  with check (auth.uid() = user_id);

create policy "Supervisors and admins update funding requests"
  on public.funding_requests for update
  using (get_user_role() in ('supervisor', 'admin'));

-- ── spotlights ────────────────────────────────────────────────
create table if not exists public.spotlights (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id   uuid not null references public.profiles(id) on delete cascade,
  message      text not null,
  tags         text[] not null default '{}',
  email_sent   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index on public.spotlights(to_user_id);
create index on public.spotlights(from_user_id);
create index on public.spotlights(created_at desc);

alter table public.spotlights enable row level security;

create policy "Users see spotlights sent to or from them"
  on public.spotlights for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Users can send spotlights"
  on public.spotlights for insert
  with check (auth.uid() = from_user_id);

create policy "System can update email_sent"
  on public.spotlights for update
  using (auth.uid() = from_user_id or get_user_role() = 'admin');

-- ── frameworks ────────────────────────────────────────────────
create table if not exists public.frameworks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  division    text,
  department  text,
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.frameworks enable row level security;

create policy "All users view frameworks"
  on public.frameworks for select
  using (auth.uid() is not null);

create policy "Supervisors and admins manage frameworks"
  on public.frameworks for all
  using (get_user_role() in ('supervisor', 'admin'));

-- ── framework_domains ─────────────────────────────────────────
create table if not exists public.framework_domains (
  id           uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title        text not null,
  description  text,
  order_index  int not null default 0
);

create index on public.framework_domains(framework_id);

alter table public.framework_domains enable row level security;

create policy "All users view framework domains"
  on public.framework_domains for select
  using (auth.uid() is not null);

create policy "Supervisors and admins manage domains"
  on public.framework_domains for all
  using (get_user_role() in ('supervisor', 'admin'));

-- ── framework_indicators ──────────────────────────────────────
create table if not exists public.framework_indicators (
  id          uuid primary key default gen_random_uuid(),
  domain_id   uuid not null references public.framework_domains(id) on delete cascade,
  title       text not null,
  description text,
  order_index int not null default 0
);

create index on public.framework_indicators(domain_id);

alter table public.framework_indicators enable row level security;

create policy "All users view indicators"
  on public.framework_indicators for select
  using (auth.uid() is not null);

create policy "Supervisors and admins manage indicators"
  on public.framework_indicators for all
  using (get_user_role() in ('supervisor', 'admin'));

-- ── observations ──────────────────────────────────────────────
create table if not exists public.observations (
  id            uuid primary key default gen_random_uuid(),
  observer_id   uuid not null references public.profiles(id) on delete cascade,
  observed_id   uuid not null references public.profiles(id) on delete cascade,
  framework_id  uuid references public.frameworks(id) on delete set null,
  obs_type      obs_type not null default 'informal',
  observed_at   timestamptz not null default now(),
  notes         text,
  signed_off    boolean not null default false,
  signed_off_at timestamptz,
  created_at    timestamptz not null default now()
);

create index on public.observations(observer_id);
create index on public.observations(observed_id);

alter table public.observations enable row level security;

create policy "Users see own observations (as observer or observed)"
  on public.observations for select
  using (
    auth.uid() = observer_id
    or auth.uid() = observed_id
    or get_user_role() = 'admin'
  );

create policy "Supervisors and admins create observations"
  on public.observations for insert
  with check (get_user_role() in ('supervisor', 'admin'));

create policy "Observers can update their observations; observed can sign off"
  on public.observations for update
  using (
    auth.uid() = observer_id
    or auth.uid() = observed_id
    or get_user_role() in ('supervisor', 'admin')
  );

-- ── observation_ratings ───────────────────────────────────────
create table if not exists public.observation_ratings (
  id              uuid primary key default gen_random_uuid(),
  observation_id  uuid not null references public.observations(id) on delete cascade,
  domain_id       uuid not null references public.framework_domains(id) on delete cascade,
  rating          int not null check (rating between 1 and 4),
  notes           text,
  unique(observation_id, domain_id)
);

create index on public.observation_ratings(observation_id);

alter table public.observation_ratings enable row level security;

create policy "Users see ratings for visible observations"
  on public.observation_ratings for select
  using (
    auth.uid() in (
      select observer_id from public.observations where id = observation_id
      union
      select observed_id from public.observations where id = observation_id
    )
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Observers can insert ratings"
  on public.observation_ratings for insert
  with check (
    auth.uid() in (
      select observer_id from public.observations where id = observation_id
    )
    or get_user_role() in ('supervisor', 'admin')
  );

create policy "Observers can update ratings"
  on public.observation_ratings for update
  using (
    auth.uid() in (
      select observer_id from public.observations where id = observation_id
    )
    or get_user_role() in ('supervisor', 'admin')
  );
