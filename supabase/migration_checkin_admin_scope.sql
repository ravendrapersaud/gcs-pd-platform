-- Tighten 1:1 access: scope admin visibility of check-in data (schedules, notes,
-- follow-ups, linked docs) from ALL admins down to "designated school and
-- division admins". A 1:1 is sensitive (especially for Student Support staff),
-- so beyond the employee and their supervisor(s), only an admin who is
-- school-wide (division = 'All School', or the system admin) OR who shares the
-- employee's division may see it. An admin with no division set sees none by
-- this rule. Idempotent: helpers are create-or-replace; policies are dropped and
-- recreated under their existing names.

-- ── Helpers (security definer → read profiles without RLS recursion) ──────────
-- Designated school/division admin FOR a given employee.
create or replace function public.is_checkin_admin(emp uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.role = 'admin'
      and (
        me.is_system_admin
        or me.division = 'All School'
        or (
          coalesce(me.division, '') <> ''
          and me.division = (select division from public.profiles where id = emp)
        )
      )
  );
$$;

-- Anyone allowed to see an employee's 1:1: the employee, their supervisor(s),
-- or a designated admin (above).
create or replace function public.can_access_checkin(emp uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select
    emp = auth.uid()
    or exists (
      select 1 from public.supervisor_assignments sa
      where sa.staff_id = emp and sa.supervisor_id = auth.uid()
    )
    or public.is_checkin_admin(emp);
$$;

grant execute on function public.is_checkin_admin(uuid) to authenticated;
grant execute on function public.can_access_checkin(uuid) to authenticated;

-- ── check_in_schedules (cadence — employee- or designated-admin-managed) ──────
drop policy if exists "View own or reports check-in schedule" on public.check_in_schedules;
create policy "View own or reports check-in schedule"
  on public.check_in_schedules for select
  using (public.can_access_checkin(employee_id));

drop policy if exists "Employee sets own check-in schedule" on public.check_in_schedules;
create policy "Employee sets own check-in schedule"
  on public.check_in_schedules for insert
  with check (employee_id = auth.uid() or public.is_checkin_admin(employee_id));

drop policy if exists "Employee updates own check-in schedule" on public.check_in_schedules;
create policy "Employee updates own check-in schedule"
  on public.check_in_schedules for update
  using (employee_id = auth.uid() or public.is_checkin_admin(employee_id))
  with check (employee_id = auth.uid() or public.is_checkin_admin(employee_id));

drop policy if exists "Employee deletes own check-in schedule" on public.check_in_schedules;
create policy "Employee deletes own check-in schedule"
  on public.check_in_schedules for delete
  using (employee_id = auth.uid() or public.is_checkin_admin(employee_id));

-- ── check_in_notes (keeps the private tier: unshared notes stay self-only) ────
drop policy if exists "Read own notes or shared report notes" on public.check_in_notes;
create policy "Read own notes or shared report notes"
  on public.check_in_notes for select
  using (employee_id = auth.uid() or (shared and public.can_access_checkin(employee_id)));

drop policy if exists "Add notes to own or report track" on public.check_in_notes;
create policy "Add notes to own or report track"
  on public.check_in_notes for insert
  with check (author_id = auth.uid() and public.can_access_checkin(employee_id));

drop policy if exists "Delete own notes" on public.check_in_notes;
create policy "Delete own notes"
  on public.check_in_notes for delete
  using (author_id = auth.uid() or public.is_checkin_admin(employee_id));

-- ── check_in_follow_ups (shared item: either participant or designated admin) ─
drop policy if exists "Read own or report follow-ups" on public.check_in_follow_ups;
create policy "Read own or report follow-ups"
  on public.check_in_follow_ups for select
  using (public.can_access_checkin(employee_id));

drop policy if exists "Add follow-ups to own or report track" on public.check_in_follow_ups;
create policy "Add follow-ups to own or report track"
  on public.check_in_follow_ups for insert
  with check (author_id = auth.uid() and public.can_access_checkin(employee_id));

drop policy if exists "Update own or report follow-ups" on public.check_in_follow_ups;
create policy "Update own or report follow-ups"
  on public.check_in_follow_ups for update
  using (public.can_access_checkin(employee_id))
  with check (public.can_access_checkin(employee_id));

drop policy if exists "Delete own follow-ups" on public.check_in_follow_ups;
create policy "Delete own follow-ups"
  on public.check_in_follow_ups for delete
  using (author_id = auth.uid() or public.is_checkin_admin(employee_id));

-- ── check_in_links (shared running-doc pointers) ─────────────────────────────
drop policy if exists "Read own or report links" on public.check_in_links;
create policy "Read own or report links"
  on public.check_in_links for select
  using (public.can_access_checkin(employee_id));

drop policy if exists "Add links to own or report track" on public.check_in_links;
create policy "Add links to own or report track"
  on public.check_in_links for insert
  with check (author_id = auth.uid() and public.can_access_checkin(employee_id));

drop policy if exists "Delete own links" on public.check_in_links;
create policy "Delete own links"
  on public.check_in_links for delete
  using (author_id = auth.uid() or public.is_checkin_admin(employee_id));
