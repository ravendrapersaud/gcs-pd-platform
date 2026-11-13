-- Project syncs & follow-ups: bring the check-in pattern (a sync cadence + owned,
-- carry-over action items) to collaborative projects. Reuses the project access
-- rules (view: owner / collaborator / supervisor / admin; edit: owner /
-- collaborator / admin) via two helpers, so follow-ups stay in step with who can
-- see/edit the project. Cadence lives as two columns on projects. Idempotent.

-- ── Access helpers (security definer → no RLS recursion) ─────────────
create or replace function public.can_view_project(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and (
      p.owner_id = auth.uid()
      or auth.uid() in (select user_id from public.project_collaborators where project_id = p.id)
      or get_user_role() = 'admin'
      or p.owner_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
    )
  );
$$;
create or replace function public.can_edit_project(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and (
      p.owner_id = auth.uid()
      or auth.uid() in (select user_id from public.project_collaborators where project_id = p.id)
      or get_user_role() = 'admin'
    )
  );
$$;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

-- ── Sync cadence on the project (updated via the existing projects policy) ──
alter table public.projects add column if not exists sync_frequency text;
alter table public.projects add column if not exists next_sync date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_sync_frequency_check') then
    alter table public.projects add constraint projects_sync_frequency_check
      check (sync_frequency is null or sync_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly'));
  end if;
end $$;

-- ── project_follow_ups ───────────────────────────────────────────────
create table if not exists public.project_follow_ups (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  owner_id     uuid references public.profiles(id) on delete set null,   -- who's responsible
  content      text not null,
  status       text not null default 'open' check (status in ('open', 'done')),
  due_date     date,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists project_follow_ups_project_idx on public.project_follow_ups(project_id);
alter table public.project_follow_ups enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_follow_ups' and policyname='View project follow-ups') then
    create policy "View project follow-ups"
      on public.project_follow_ups for select
      using (public.can_view_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_follow_ups' and policyname='Manage project follow-ups') then
    create policy "Manage project follow-ups"
      on public.project_follow_ups for all
      using (public.can_edit_project(project_id))
      with check (public.can_edit_project(project_id));
  end if;
end $$;
