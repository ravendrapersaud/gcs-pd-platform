-- Check-ins / 1:1s: a typed layer on the Forms engine. A check-in is just a form
-- template with category='check_in' — it reuses the whole fill/response/RLS flow,
-- but the portfolio surfaces it as its own "Check-ins" section (the non-teaching
-- analogue of the observation conversation). Seeds two ready-to-use, two-sided
-- templates. Idempotent.

alter table public.form_templates
  add column if not exists category text not null default 'form';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'form_templates_category_check') then
    alter table public.form_templates
      add constraint form_templates_category_check check (category in ('form', 'check_in'));
  end if;
end $$;

-- ── Seed: Quarterly 1:1 (employee reflects, supervisor responds) ──
insert into public.form_templates (title, description, category, fill_by, visible_to_employee, is_active, fields)
select
  'Quarterly 1:1 check-in',
  'A periodic conversation between an employee and their supervisor. The employee reflects; the supervisor adds notes and next steps.',
  'check_in', 'both', true, true,
  '[
    {"id":"s_emp","type":"section","label":"Employee reflection"},
    {"id":"e_well","type":"long_text","label":"What has gone well since our last check-in?"},
    {"id":"e_challenge","type":"long_text","label":"What has been challenging, or where are you blocked?"},
    {"id":"e_support","type":"long_text","label":"Where would you like support or room to grow?"},
    {"id":"s_mgr","type":"section","label":"Supervisor notes"},
    {"id":"m_strengths","type":"long_text","label":"Strengths and contributions observed"},
    {"id":"m_focus","type":"long_text","label":"Focus for the next period"},
    {"id":"m_next","type":"long_text","label":"Agreed next steps"}
  ]'::jsonb
where not exists (select 1 from public.form_templates where title = 'Quarterly 1:1 check-in' and category = 'check_in');

-- ── Seed: Annual self-review ──
insert into public.form_templates (title, description, category, fill_by, visible_to_employee, is_active, fields)
select
  'Annual self-review',
  'A year-end self-assessment with a space for the supervisor to respond. Appears in the employee portfolio.',
  'check_in', 'both', true, true,
  '[
    {"id":"s_self","type":"section","label":"Self-assessment"},
    {"id":"a_summary","type":"long_text","label":"Summary of your work and impact this year"},
    {"id":"a_goals","type":"long_text","label":"Goals you set and your progress toward them"},
    {"id":"a_growth","type":"long_text","label":"Professional growth and learning this year"},
    {"id":"a_next","type":"long_text","label":"Goals and hopes for next year"},
    {"id":"s_sup","type":"section","label":"Supervisor response"},
    {"id":"r_summary","type":"long_text","label":"Supervisor summary and feedback"}
  ]'::jsonb
where not exists (select 1 from public.form_templates where title = 'Annual self-review' and category = 'check_in');
