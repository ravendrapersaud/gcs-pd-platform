-- Non-teaching competency frameworks, routed by track (see
-- migration_template_framework_targeting.sql). These give Student Support and
-- Institutional staff a rubric analogous to the teaching frameworks. Idempotent
-- (guarded by title). Domains/indicators inserted with explicit order_index.

-- ── Student Support Practice (student_support track, all roles) ─────────
do $$
declare fw uuid; d uuid;
begin
  if not exists (select 1 from public.frameworks where title = 'Student Support Practice') then
    insert into public.frameworks (title, description, target_tracks, target_roles)
    values (
      'Student Support Practice',
      'Competencies for student-facing support staff (counseling, health, learning support).',
      array['student_support'], '{}'
    ) returning id into fw;

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Ethics & Confidentiality', 'Protecting students and families and meeting professional/legal duties.', 0) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Safeguards student and family privacy per policy and law', null, 0),
      (d, 'Understands and acts on mandated-reporting duties', null, 1),
      (d, 'Documents accurately and stores records securely', null, 2);

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Student-Centered Support', 'Meeting each student where they are and moving them forward.', 1) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Builds trusting, developmentally appropriate relationships', null, 0),
      (d, 'Assesses needs and tailors support plans', null, 1),
      (d, 'Monitors progress and adjusts support over time', null, 2);

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Collaboration & Communication', 'Working as part of a coordinated support system.', 2) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Partners with teachers, families, and outside providers', null, 0),
      (d, 'Communicates clearly while respecting confidentiality', null, 1),
      (d, 'Contributes to a coordinated, whole-child approach', null, 2);
  end if;
end $$;

-- ── Operational Excellence (institutional track, all roles) ─────────────
do $$
declare fw uuid; d uuid;
begin
  if not exists (select 1 from public.frameworks where title = 'Operational Excellence') then
    insert into public.frameworks (title, description, target_tracks, target_roles)
    values (
      'Operational Excellence',
      'Competencies for institutional staff (operations, advancement, business, communications, technology).',
      array['institutional'], '{}'
    ) returning id into fw;

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Service & Responsiveness', 'Serving colleagues, families, and the school well.', 0) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Anticipates and meets the needs of those they serve', null, 0),
      (d, 'Responds promptly and follows through', null, 1),
      (d, 'Communicates proactively and professionally', null, 2);

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Execution & Reliability', 'Delivering work accurately and dependably.', 1) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Plans and delivers projects on time and on budget', null, 0),
      (d, 'Maintains accurate systems and records', null, 1),
      (d, 'Solves problems and escalates appropriately', null, 2);

    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Stewardship & Improvement', 'Using resources well and getting better over time.', 2) returning id into d;
    insert into public.framework_indicators (domain_id, title, description, order_index) values
      (d, 'Uses the school''s resources responsibly', null, 0),
      (d, 'Seeks and acts on feedback to improve processes', null, 1),
      (d, 'Advances the school''s mission and values', null, 2);
  end if;
end $$;
