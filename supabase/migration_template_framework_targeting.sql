-- Route check-in/review TEMPLATES and competency FRAMEWORKS by track + role.
-- Each gains two array filters:
--   target_tracks  — empty = all tracks, else a subset of
--                    faculty | student_support | institutional
--   target_roles   — empty = all roles, else a subset of PD_ROLES
-- An item applies to a person when (tracks empty OR includes their track)
-- AND (roles empty OR intersects their roles[]). See lib/tracks.ts
-- targetMatchesPerson(). This is how a CTO (Senior Administrator) and an HS
-- Division Head — different tracks, both leaders — see a leadership review an
-- IT technician does not. Idempotent.

alter table public.form_templates
  add column if not exists target_tracks text[] not null default '{}',
  add column if not exists target_roles  text[] not null default '{}';

alter table public.frameworks
  add column if not exists target_tracks text[] not null default '{}',
  add column if not exists target_roles  text[] not null default '{}';

-- ── Seed: a cross-track leadership review (check-in) ────────────────────
-- Targets the leadership roles across every track. Keep in sync with
-- lib/roles.ts LEADERSHIP_ROLES.
do $$
begin
  if not exists (select 1 from public.form_templates where title = 'Leadership growth & 1:1 review') then
    insert into public.form_templates
      (title, description, fields, fill_by, visible_to_employee, is_active, category, target_tracks, target_roles)
    values (
      'Leadership growth & 1:1 review',
      'A periodic review for people who lead others — on any track. Focuses on team health, delegation, and strategic priorities.',
      '[
        {"id":"f_wins","type":"long_text","label":"Biggest wins for your team since the last review","required":false},
        {"id":"f_people","type":"long_text","label":"How are your direct reports doing? Anyone to develop, stretch, or support?","required":false},
        {"id":"f_delegation","type":"long_text","label":"What are you holding that could be delegated or shared?","required":false},
        {"id":"f_priorities","type":"long_text","label":"Top strategic priorities for the next period","required":false},
        {"id":"f_support","type":"long_text","label":"Where do you need support from your supervisor?","required":false}
      ]'::jsonb,
      'both', true, true, 'check_in',
      '{}',
      array['Full Access','Campus Head','Division Leader','Senior Administrator','Team Lead']
    );
  end if;
end $$;

-- ── Seed: a cross-track People Leadership competency framework ──────────
do $$
declare fw_id uuid; d1 uuid; d2 uuid;
begin
  if not exists (select 1 from public.frameworks where title = 'People Leadership') then
    insert into public.frameworks (title, description, target_tracks, target_roles)
    values (
      'People Leadership',
      'Cross-track competencies for anyone who leads people and stewards resources at GCS.',
      '{}',
      array['Full Access','Campus Head','Division Leader','Senior Administrator','Team Lead']
    )
    returning id into fw_id;

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw_id, 'Leading People', 'Developing, supporting, and getting the best from a team.', 0)
    returning id into d1;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d1, 'Coaches and develops direct reports', null, 0),
      (d1, 'Gives timely, specific, actionable feedback', null, 1),
      (d1, 'Builds an inclusive, trusting team culture', null, 2);

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw_id, 'Stewardship & Strategy', 'Aligning the team''s work to the mission and managing resources well.', 1)
    returning id into d2;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d2, 'Sets clear goals aligned to the school''s mission', null, 0),
      (d2, 'Manages time, budget, and resources responsibly', null, 1),
      (d2, 'Communicates decisions transparently', null, 2);
  end if;
end $$;
