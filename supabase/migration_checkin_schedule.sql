-- Check-in cadence: each employee sets how often they want to check in and keeps
-- a running list of "note slots" to bring to those conversations. The schedule is
-- the employee's to edit at any time; notes can be private to the employee or
-- shared with their supervisor. Supervisors (and admins) can view a report's
-- cadence and shared notes, and add shared notes of their own. Idempotent.

-- ── check_in_schedules: one per employee ─────────────────────
create table if not exists public.check_in_schedules (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null unique references public.profiles(id) on delete cascade,
  frequency    text not null default 'monthly'
                 check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'twice_yearly', 'none')),
  template_id  uuid references public.form_templates(id) on delete set null,  -- preferred check-in form
  start_date   date not null default current_date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.check_in_schedules enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_schedules' and policyname='View own or reports check-in schedule') then
    create policy "View own or reports check-in schedule"
      on public.check_in_schedules for select
      using (
        employee_id = auth.uid()
        or get_user_role() = 'admin'
        or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_schedules' and policyname='Employee sets own check-in schedule') then
    create policy "Employee sets own check-in schedule"
      on public.check_in_schedules for insert
      with check (employee_id = auth.uid() or get_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_schedules' and policyname='Employee updates own check-in schedule') then
    create policy "Employee updates own check-in schedule"
      on public.check_in_schedules for update
      using (employee_id = auth.uid() or get_user_role() = 'admin')
      with check (employee_id = auth.uid() or get_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_schedules' and policyname='Employee deletes own check-in schedule') then
    create policy "Employee deletes own check-in schedule"
      on public.check_in_schedules for delete
      using (employee_id = auth.uid() or get_user_role() = 'admin');
  end if;
end $$;

-- ── check_in_notes: the "note slots" ─────────────────────────
create table if not exists public.check_in_notes (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,  -- whose check-in track
  author_id    uuid references public.profiles(id) on delete set null,
  content      text not null,
  shared       boolean not null default true,  -- visible to supervisor/admin; false = private to the employee
  created_at   timestamptz not null default now()
);
create index if not exists check_in_notes_employee_idx on public.check_in_notes(employee_id);
alter table public.check_in_notes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_notes' and policyname='Read own notes or shared report notes') then
    create policy "Read own notes or shared report notes"
      on public.check_in_notes for select
      using (
        employee_id = auth.uid()
        or (shared and (
          get_user_role() = 'admin'
          or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
        ))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_notes' and policyname='Add notes to own or report track') then
    create policy "Add notes to own or report track"
      on public.check_in_notes for insert
      with check (
        author_id = auth.uid()
        and (
          employee_id = auth.uid()
          or get_user_role() = 'admin'
          or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_notes' and policyname='Delete own notes') then
    create policy "Delete own notes"
      on public.check_in_notes for delete
      using (author_id = auth.uid() or get_user_role() = 'admin');
  end if;
end $$;
