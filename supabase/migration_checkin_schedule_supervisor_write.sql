-- Let a report's supervisor set up / adjust the check-in cadence too. The
-- schedule is still the employee's to own and change; this just makes "set the
-- initial rhythm" an available option for supervisors (parity with admin on
-- insert + update). Delete stays employee/admin only. Idempotent.

-- INSERT: employee, their supervisor, or admin
drop policy if exists "Employee sets own check-in schedule" on public.check_in_schedules;
drop policy if exists "Employee or supervisor sets check-in schedule" on public.check_in_schedules;
create policy "Employee or supervisor sets check-in schedule"
  on public.check_in_schedules for insert
  with check (
    employee_id = auth.uid()
    or get_user_role() = 'admin'
    or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
  );

-- UPDATE: employee, their supervisor, or admin
drop policy if exists "Employee updates own check-in schedule" on public.check_in_schedules;
drop policy if exists "Employee or supervisor updates check-in schedule" on public.check_in_schedules;
create policy "Employee or supervisor updates check-in schedule"
  on public.check_in_schedules for update
  using (
    employee_id = auth.uid()
    or get_user_role() = 'admin'
    or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
  )
  with check (
    employee_id = auth.uid()
    or get_user_role() = 'admin'
    or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
  );
