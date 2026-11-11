-- Cascading goals: School → Office → Individual.
-- A goal gains a `scope` and an optional `parent_goal_id` so individuals can
-- align their goals under an office goal, and offices under a school goal.
--   scope: individual (default, existing behavior) | office | school
--   parent_goal_id: the goal this one aligns up to (null = top-level)
-- Organization goals (office/school) are readable by everyone so people can
-- align to them and see the cascade; creating them is role-gated (office =
-- supervisor/admin, school = admin). Idempotent.

alter table public.goals
  add column if not exists scope text not null default 'individual'
    check (scope in ('individual', 'office', 'school')),
  add column if not exists parent_goal_id uuid references public.goals(id) on delete set null;

create index if not exists goals_parent_goal_idx on public.goals(parent_goal_id);

-- ── SELECT: org goals visible to all; keep the existing clauses ──────────
drop policy if exists "Users see own goals or collaborated goals" on public.goals;
create policy "Users see own goals or collaborated goals"
  on public.goals for select
  using (
    auth.uid() = owner_id
    or scope in ('school', 'office')
    or auth.uid() in (
      select user_id from public.goal_collaborators where goal_id = goals.id
    )
    or get_user_role() = 'admin'
    or (
      get_user_role() = 'supervisor'
      and owner_id in (
        select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()
      )
    )
    or lower(coalesce(get_user_department(), '')) = 'academic administration'
  );

-- ── INSERT: gate org-goal creation by role ──────────────────────────────
drop policy if exists "Users can create goals" on public.goals;
create policy "Users can create goals"
  on public.goals for insert
  with check (
    auth.uid() = owner_id
    and (
      scope = 'individual'
      or (scope = 'office' and get_user_role() in ('supervisor', 'admin'))
      or (scope = 'school' and get_user_role() = 'admin')
    )
  );

-- ── Rollup: aligned-goal count + avg progress per parent, RLS-bypassing so
--    leaders see true school-wide totals (SECURITY DEFINER, read-only). ────
create or replace function public.org_goal_rollups()
returns table(parent_goal_id uuid, aligned_count int, avg_pct int)
language sql
security definer
stable
set search_path = public
as $$
  select parent_goal_id, count(*)::int, coalesce(round(avg(progress_pct))::int, 0)
  from public.goals
  where parent_goal_id is not null and status in ('active', 'completed', 'paused')
  group by parent_goal_id
$$;
grant execute on function public.org_goal_rollups() to authenticated;
