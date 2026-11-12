-- Check-in follow-ups: the trackable layer on top of the running 1:1 notes. A
-- follow-up is a shared commitment that carries between meetings — short text, an
-- owner (the employee or their supervisor), open/done status, optional due date —
-- so open items surface at the next check-in instead of getting buried in prose.
-- Unlike notes there is NO private tier: a follow-up is a mutual item, always
-- visible to both parties. Either participant (and admins) can add, edit, or mark
-- one done; the author or an admin can delete. Idempotent.

create table if not exists public.check_in_follow_ups (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,  -- whose 1:1 track
  author_id     uuid references public.profiles(id) on delete set null,          -- who raised it
  owner_id      uuid references public.profiles(id) on delete set null,          -- who's responsible
  content       text not null,
  status        text not null default 'open' check (status in ('open', 'done')),
  due_date      date,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists check_in_follow_ups_employee_idx on public.check_in_follow_ups(employee_id);
alter table public.check_in_follow_ups enable row level security;

do $$ begin
  -- Read: the employee, their supervisor(s), or an admin. No private tier.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_follow_ups' and policyname='Read own or report follow-ups') then
    create policy "Read own or report follow-ups"
      on public.check_in_follow_ups for select
      using (
        employee_id = auth.uid()
        or get_user_role() = 'admin'
        or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;

  -- Insert: either party (or admin) may raise one; author must be the caller.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_follow_ups' and policyname='Add follow-ups to own or report track') then
    create policy "Add follow-ups to own or report track"
      on public.check_in_follow_ups for insert
      with check (
        author_id = auth.uid()
        and (
          employee_id = auth.uid()
          or get_user_role() = 'admin'
          or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
        )
      );
  end if;

  -- Update: either participant (or admin) can edit / mark done — it's a shared item.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_follow_ups' and policyname='Update own or report follow-ups') then
    create policy "Update own or report follow-ups"
      on public.check_in_follow_ups for update
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
  end if;

  -- Delete: the author or an admin (marking done is the normal retire path).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_follow_ups' and policyname='Delete own follow-ups') then
    create policy "Delete own follow-ups"
      on public.check_in_follow_ups for delete
      using (author_id = auth.uid() or get_user_role() = 'admin');
  end if;
end $$;
