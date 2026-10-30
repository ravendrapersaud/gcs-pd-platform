-- ── School Goals access for the academic administration team (idempotent) ──
-- Admins (and a supervisor's assigned reports) already read goals broadly.
-- The School Goals directory is also opened to anyone whose profile
-- department is "Academic Administration" — so RLS must let them read every
-- goal, not just their own. get_user_department() mirrors get_user_role():
-- SECURITY DEFINER so it isn't itself subject to RLS (no recursion).

create or replace function public.get_user_department()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select department from public.profiles where id = auth.uid()
$$;

drop policy if exists "Users see own goals or collaborated goals" on public.goals;
create policy "Users see own goals or collaborated goals"
  on public.goals for select
  using (
    auth.uid() = owner_id
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
