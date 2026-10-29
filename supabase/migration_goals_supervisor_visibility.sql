-- ── Goals visibility for supervisors & admins (idempotent) ──────────
-- Goals are owned by a person and (optionally) co-owned by collaborators.
-- This gives oversight read access:
--   • admins can read everyone's goals;
--   • supervisors can read the goals of the staff ASSIGNED to them
--     (supervisor_assignments.staff_id), and no one else's.
--
-- This also TIGHTENS the previous policy, which let any supervisor read any
-- goal. The goals page surfaces these via a read-only "Team" tab; owners and
-- co-owners keep full access. No recursion: supervisor_assignments' own
-- SELECT policy is auth.uid() IS NOT NULL and never references goals.

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
  );
