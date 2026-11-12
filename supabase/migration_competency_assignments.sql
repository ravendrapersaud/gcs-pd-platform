-- Per-employee competency assignment. Until now a framework reached a person
-- only through track+role targeting (frameworks.target_tracks/target_roles).
-- This lets a supervisor (a department head) or an admin pin a specific
-- framework to a specific individual as a named focus — "these are Jane's focus
-- competencies this year" — independent of her track/role. Assigned frameworks
-- then also show on that person's Frameworks grid and become taggable on their
-- projects, so they can gather evidence against them. Idempotent.
create table if not exists public.competency_assignments (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  assigned_by  uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (subject_id, framework_id)
);

create index if not exists competency_assignments_subject_idx
  on public.competency_assignments(subject_id);

alter table public.competency_assignments enable row level security;

-- Visible to the subject, their supervisor, and admins. Written (assigned /
-- removed) only by the subject's supervisor or an admin — department heads are
-- the supervisors of their reports.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_assignments' and policyname='Read competency assignments by relationship') then
    create policy "Read competency assignments by relationship" on public.competency_assignments for select using (
      subject_id = auth.uid()
      or get_user_role() = 'admin'
      or (get_user_role() = 'supervisor' and subject_id in (
        select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()
      ))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_assignments' and policyname='Assign competencies to reports or any (admin)') then
    create policy "Assign competencies to reports or any (admin)" on public.competency_assignments for insert with check (
      assigned_by = auth.uid()
      and (
        get_user_role() = 'admin'
        or (get_user_role() = 'supervisor' and subject_id in (
          select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()
        ))
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_assignments' and policyname='Remove competency assignments for reports or any (admin)') then
    create policy "Remove competency assignments for reports or any (admin)" on public.competency_assignments for delete using (
      get_user_role() = 'admin'
      or (get_user_role() = 'supervisor' and subject_id in (
        select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()
      ))
    );
  end if;
end $$;
