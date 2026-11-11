-- Competency evidence: the non-teaching mirror of Teaching with Grace's
-- evidence model (indicators you mark "evidenced" + a written description per
-- domain — no numeric ratings). Two sources deposit evidence against the SAME
-- framework indicators/domains:
--   review  — a check-in/review whose template is linked to a framework
--   project — a project tagging the indicators it advances
-- Grouping by domain then falls out for free (every indicator rolls up to its
-- domain). Idempotent.

-- A check-in/review template may be scored-as-evidence against a framework.
alter table public.form_templates
  add column if not exists framework_id uuid references public.frameworks(id) on delete set null;

create table if not exists public.competency_evidence (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.profiles(id) on delete cascade,
  framework_id  uuid not null references public.frameworks(id) on delete cascade,
  domain_id     uuid not null references public.framework_domains(id) on delete cascade,
  indicator_id  uuid references public.framework_indicators(id) on delete cascade,  -- null = domain-level narrative
  source        text not null check (source in ('review', 'project')),
  response_id   uuid references public.form_responses(id) on delete cascade,        -- source = review
  project_id    uuid references public.projects(id) on delete cascade,              -- source = project
  note          text,
  author_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists competency_evidence_subject_idx on public.competency_evidence(subject_id);
create index if not exists competency_evidence_domain_idx on public.competency_evidence(domain_id);
create index if not exists competency_evidence_framework_idx on public.competency_evidence(framework_id);

alter table public.competency_evidence enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_evidence' and policyname='View own or reports competency evidence') then
    create policy "View own or reports competency evidence"
      on public.competency_evidence for select
      using (
        subject_id = auth.uid()
        or get_user_role() = 'admin'
        or subject_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_evidence' and policyname='Add competency evidence for self or reports') then
    create policy "Add competency evidence for self or reports"
      on public.competency_evidence for insert
      with check (
        author_id = auth.uid()
        and (
          subject_id = auth.uid()
          or get_user_role() = 'admin'
          or subject_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='competency_evidence' and policyname='Delete competency evidence (author/subject/oversight)') then
    create policy "Delete competency evidence (author/subject/oversight)"
      on public.competency_evidence for delete
      using (
        author_id = auth.uid()
        or subject_id = auth.uid()
        or get_user_role() = 'admin'
        or subject_id in (select staff_id from public.supervisor_assignments where supervisor_id = auth.uid())
      );
  end if;
end $$;