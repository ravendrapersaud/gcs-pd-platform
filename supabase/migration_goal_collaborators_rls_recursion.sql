-- Fix: "infinite recursion detected in policy for relation goals"
--
-- The goals SELECT policy subqueries goal_collaborators (to check for a
-- collaborator), while goal_collaborators had a FOR ALL policy ("Goal owners
-- can manage collaborators") that subqueries goals. FOR ALL includes SELECT,
-- so reading goals -> reads goal_collaborators -> reads goals -> ... which
-- Postgres aborts as infinite recursion.
--
-- SELECT on goal_collaborators is already covered by the permissive
-- "Users can view collaborators on visible goals" policy, so we scope the
-- manage policy down to the write commands only (insert/update/delete). That
-- removes goal_collaborators' reference to goals from the SELECT path and
-- breaks the loop. Idempotent.

drop policy if exists "Goal owners can manage collaborators" on public.goal_collaborators;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goal_collaborators'
      and policyname = 'Goal owners can insert collaborators'
  ) then
    create policy "Goal owners can insert collaborators"
      on public.goal_collaborators for insert
      with check (
        auth.uid() in (select owner_id from public.goals where id = goal_id)
        or get_user_role() = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goal_collaborators'
      and policyname = 'Goal owners can update collaborators'
  ) then
    create policy "Goal owners can update collaborators"
      on public.goal_collaborators for update
      using (
        auth.uid() in (select owner_id from public.goals where id = goal_id)
        or get_user_role() = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goal_collaborators'
      and policyname = 'Goal owners can delete collaborators'
  ) then
    create policy "Goal owners can delete collaborators"
      on public.goal_collaborators for delete
      using (
        auth.uid() in (select owner_id from public.goals where id = goal_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;
