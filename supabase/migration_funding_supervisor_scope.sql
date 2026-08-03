-- ── Scope funding approvals to assigned supervisors (idempotent) ─────
-- Before: any supervisor could approve/deny ANY funding request.
-- After: supervisors may only act on requests belonging to their own
-- assigned reports (supervisor_assignments); admins remain unrestricted.
-- The API route (app/api/funding/route.ts) enforces the same rule; this
-- is the authoritative database-layer guard (defense in depth).

-- Helper: is the current user the assigned supervisor of `target`?
create or replace function public.is_supervisor_of(target uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.supervisor_assignments
    where supervisor_id = auth.uid()
      and staff_id = target
  );
$$;

-- Replace the over-broad update policy with a scoped one.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funding_requests'
      and policyname = 'Supervisors and admins update funding requests'
  ) then
    drop policy "Supervisors and admins update funding requests"
      on public.funding_requests;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funding_requests'
      and policyname = 'Admins and assigned supervisors update funding requests'
  ) then
    create policy "Admins and assigned supervisors update funding requests"
      on public.funding_requests for update
      using (
        get_user_role() = 'admin'
        or (
          get_user_role() = 'supervisor'
          and public.is_supervisor_of(user_id)
        )
      );
  end if;
end
$$;
