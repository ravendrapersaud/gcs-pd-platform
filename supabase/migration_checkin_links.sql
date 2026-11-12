-- Check-in linked docs: the "running Google doc(s)" that anchor a 1:1. A link is
-- a shared pointer (title + URL — typically a Google Doc/Sheet the pair keep
-- open across meetings) living alongside the 1:1 notes and follow-ups. Like
-- follow-ups there is NO private tier: a linked doc is a shared surface, visible
-- to the employee, their supervisor(s), and admins. The author or an admin can
-- remove one. Idempotent.

create table if not exists public.check_in_links (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,  -- whose 1:1 track
  author_id    uuid references public.profiles(id) on delete set null,          -- who added it
  title        text not null,
  url          text not null,
  created_at   timestamptz not null default now()
);
create index if not exists check_in_links_employee_idx on public.check_in_links(employee_id);
alter table public.check_in_links enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_links' and policyname='Read own or report links') then
    create policy "Read own or report links"
      on public.check_in_links for select
      using (
        employee_id = auth.uid()
        or get_user_role() = 'admin'
        or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_links' and policyname='Add links to own or report track') then
    create policy "Add links to own or report track"
      on public.check_in_links for insert
      with check (
        author_id = auth.uid()
        and (
          employee_id = auth.uid()
          or get_user_role() = 'admin'
          or employee_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_in_links' and policyname='Delete own links') then
    create policy "Delete own links"
      on public.check_in_links for delete
      using (author_id = auth.uid() or get_user_role() = 'admin');
  end if;
end $$;
