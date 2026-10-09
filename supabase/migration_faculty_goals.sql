-- ── Faculty inquiry goals (idempotent) ──────────────────────────────
-- Goals can be a standard goal or a structured "faculty inquiry" goal
-- (a question about classroom culture/pedagogy, how low-stakes evidence
-- is captured, and a reflection/action plan). The three parts live in
-- goals.details (jsonb). A configurable deadline for formulating the
-- question is stored in app_settings.

alter table public.goals
  add column if not exists goal_type text not null default 'standard';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_goal_type_check') then
    alter table public.goals
      add constraint goals_goal_type_check check (goal_type in ('standard', 'faculty_inquiry'));
  end if;
end $$;

alter table public.goals
  add column if not exists details jsonb;

-- Deadline for formulating the inquiry question (admin-editable).
insert into public.app_settings (key, value)
select 'faculty_goal_question_due', '2026-10-13'
where not exists (select 1 from public.app_settings where key = 'faculty_goal_question_due');
