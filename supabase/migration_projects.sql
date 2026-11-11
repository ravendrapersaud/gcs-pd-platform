-- Projects: a dedicated, collaborative work object for all staff — the
-- non-teaching analogue of an observation (the evidence of work), distinct from
-- goals (the outcome). Owner + co-owners (mirrors goal_collaborators), milestones,
-- optional links to goals, a Drive folder, and a visibility tier for confidential
-- (student-facing) work. RLS mirrors goals: owner / collaborator / your supervisor
-- / admin. Idempotent.

-- ── projects ─────────────────────────────────────────────────
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  status            text not null default 'planning'
                      check (status in ('planning', 'active', 'on_hold', 'complete', 'archived')),
  progress_pct      int not null default 0 check (progress_pct between 0 and 100),
  school_year_start int,                 -- e.g. 2026 = 2026–27; scopes the portfolio
  start_date        date,
  target_date       date,
  drive_folder_url  text,
  visibility        text not null default 'normal' check (visibility in ('normal', 'private')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_year_idx on public.projects(school_year_start);
alter table public.projects enable row level security;

-- ── project_collaborators (mirrors goal_collaborators) ───────
create table if not exists public.project_collaborators (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, user_id)
);
alter table public.project_collaborators enable row level security;

-- ── project_milestones ───────────────────────────────────────
create table if not exists public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  due_date    date,
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists project_milestones_project_idx on public.project_milestones(project_id);
alter table public.project_milestones enable row level security;

-- ── project_goals (link projects ↔ goals) ────────────────────
create table if not exists public.project_goals (
  project_id uuid not null references public.projects(id) on delete cascade,
  goal_id    uuid not null references public.goals(id) on delete cascade,
  primary key (project_id, goal_id)
);
create index if not exists project_goals_goal_idx on public.project_goals(goal_id);
alter table public.project_goals enable row level security;

-- ── helpers (predicates reused across policies) ──────────────
-- "Can this user SEE this project?" owner / collaborator / admin / their supervisor.
-- "Can this user EDIT it?" owner / collaborator / admin.

-- ── projects policies ────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='Users see own or collaborated projects') then
    create policy "Users see own or collaborated projects"
      on public.projects for select
      using (
        auth.uid() = owner_id
        or auth.uid() in (select user_id from public.project_collaborators where project_id = projects.id)
        or get_user_role() = 'admin'
        or owner_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='Users can create projects') then
    create policy "Users can create projects"
      on public.projects for insert
      with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='Owners and collaborators update projects') then
    create policy "Owners and collaborators update projects"
      on public.projects for update
      using (
        auth.uid() = owner_id
        or auth.uid() in (select user_id from public.project_collaborators where project_id = projects.id)
        or get_user_role() = 'admin'
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='Owners delete projects') then
    create policy "Owners delete projects"
      on public.projects for delete
      using (auth.uid() = owner_id or get_user_role() = 'admin');
  end if;
end $$;

-- ── project_collaborators policies (write-only + permissive SELECT,
-- same recursion-avoidance as goal_collaborators) ────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_collaborators' and policyname='View collaborators on visible projects') then
    create policy "View collaborators on visible projects"
      on public.project_collaborators for select
      using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_collaborators' and policyname='Project owners insert collaborators') then
    create policy "Project owners insert collaborators"
      on public.project_collaborators for insert
      with check (auth.uid() in (select owner_id from public.projects where id = project_id) or get_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_collaborators' and policyname='Project owners delete collaborators') then
    create policy "Project owners delete collaborators"
      on public.project_collaborators for delete
      using (auth.uid() in (select owner_id from public.projects where id = project_id) or get_user_role() = 'admin');
  end if;
end $$;

-- ── project_milestones policies ──────────────────────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_milestones' and policyname='View milestones on visible projects') then
    create policy "View milestones on visible projects"
      on public.project_milestones for select
      using (
        exists (
          select 1 from public.projects p
          where p.id = project_id
            and (
              p.owner_id = auth.uid()
              or auth.uid() in (select user_id from public.project_collaborators where project_id = p.id)
              or get_user_role() = 'admin'
              or p.owner_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
            )
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_milestones' and policyname='Editors manage milestones') then
    create policy "Editors manage milestones"
      on public.project_milestones for all
      using (
        exists (
          select 1 from public.projects p
          where p.id = project_id
            and (
              p.owner_id = auth.uid()
              or auth.uid() in (select user_id from public.project_collaborators where project_id = p.id)
              or get_user_role() = 'admin'
            )
        )
      )
      with check (
        exists (
          select 1 from public.projects p
          where p.id = project_id
            and (
              p.owner_id = auth.uid()
              or auth.uid() in (select user_id from public.project_collaborators where project_id = p.id)
              or get_user_role() = 'admin'
            )
        )
      );
  end if;
end $$;

-- ── project_goals policies ───────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_goals' and policyname='View project-goal links') then
    create policy "View project-goal links"
      on public.project_goals for select
      using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_goals' and policyname='Editors link project goals') then
    create policy "Editors link project goals"
      on public.project_goals for insert
      with check (
        auth.uid() in (select owner_id from public.projects where id = project_id)
        or auth.uid() in (select user_id from public.project_collaborators where project_id = project_goals.project_id)
        or get_user_role() = 'admin'
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_goals' and policyname='Editors unlink project goals') then
    create policy "Editors unlink project goals"
      on public.project_goals for delete
      using (
        auth.uid() in (select owner_id from public.projects where id = project_id)
        or auth.uid() in (select user_id from public.project_collaborators where project_id = project_goals.project_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;
