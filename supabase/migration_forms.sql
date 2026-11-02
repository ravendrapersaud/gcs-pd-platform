-- Forms engine: admin-built templates, filled out for an employee, surfaced in
-- their portfolio. Who may fill a form and who may see the completed copy are
-- set per template. Idempotent.

create table if not exists public.form_templates (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  fields               jsonb not null default '[]',  -- [{id,type,label,required,options?,help?}]
  fill_by              text not null default 'manager',  -- 'employee' | 'manager' | 'both'
  visible_to_employee  boolean not null default false,   -- can the subject see completed copies?
  is_active            boolean not null default true,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

create table if not exists public.form_responses (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.form_templates(id) on delete cascade,
  subject_id    uuid not null references public.profiles(id) on delete cascade,  -- employee the form is about
  filled_by     uuid references public.profiles(id) on delete set null,
  answers       jsonb not null default '{}',  -- { field_id: value }
  status        text not null default 'submitted',  -- 'draft' | 'submitted'
  submitted_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists form_responses_subject_idx on public.form_responses(subject_id);

alter table public.form_templates enable row level security;
alter table public.form_responses enable row level security;

-- Templates: everyone can read (needed to fill / display); admins manage.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_templates' and policyname='Anyone can read form templates') then
    create policy "Anyone can read form templates" on public.form_templates for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_templates' and policyname='Admins manage form templates') then
    create policy "Admins manage form templates" on public.form_templates for all
      using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
  end if;
end $$;

-- Responses: a supervisor reaches their reports, admins reach everyone, a
-- person reaches their own only when the template allows (visible_to_employee).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_responses' and policyname='Read form responses by relationship') then
    create policy "Read form responses by relationship" on public.form_responses for select using (
      filled_by = auth.uid()
      or get_user_role() = 'admin'
      or (get_user_role() = 'supervisor' and subject_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()))
      or (subject_id = auth.uid() and exists (select 1 from public.form_templates t where t.id = form_responses.template_id and t.visible_to_employee = true))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_responses' and policyname='Fill form responses for permitted subjects') then
    create policy "Fill form responses for permitted subjects" on public.form_responses for insert with check (
      filled_by = auth.uid() and (
        subject_id = auth.uid()
        or get_user_role() = 'admin'
        or (get_user_role() = 'supervisor' and subject_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid()))
      )
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_responses' and policyname='Edit own or admin form responses') then
    create policy "Edit own or admin form responses" on public.form_responses for update
      using (filled_by = auth.uid() or get_user_role() = 'admin');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='form_responses' and policyname='Delete own or admin form responses') then
    create policy "Delete own or admin form responses" on public.form_responses for delete
      using (filled_by = auth.uid() or get_user_role() = 'admin');
  end if;
end $$;
