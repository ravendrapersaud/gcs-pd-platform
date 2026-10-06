-- ── Teaching with Grace: framework seed + capture column (idempotent) ─
-- Seeds the "Teaching with Grace" framework (4 pillars as domains, their
-- look-fors as indicators) so it is a first-class framework in reporting
-- and the generic observation form, and adds observations.twg_data (jsonb)
-- for the rich capture payload (pre-conversation, timed pillar-tagged
-- notes, per-pillar analysis, wrap-up). Content mirrors lib/twg.ts.
-- Safe to run multiple times.

alter table public.observations
  add column if not exists twg_data jsonb;

do $$
declare
  fw uuid;
  dom uuid;
begin
  -- Framework
  select id into fw from public.frameworks where title = 'Teaching with Grace' limit 1;
  if fw is null then
    insert into public.frameworks (title, description)
    values (
      'Teaching with Grace',
      'Grace Church School''s shared teaching framework: the four pillars — Designing Courses, Teaching Lessons, Building Relationships, and Modeling Virtues.'
    )
    returning id into fw;
  end if;

  -- Pillar 1: Designing Courses
  select id into dom from public.framework_domains where framework_id = fw and title = 'Designing Courses' limit 1;
  if dom is null then
    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Designing Courses', 'Clear purpose, intellectual challenge, intentional course design.', 1)
    returning id into dom;
  end if;
  insert into public.framework_indicators (domain_id, title, order_index)
  select dom, v.t, v.i from (values
    ('Lesson goals are clear and explicitly connected to broader course aims.', 1),
    ('The lesson builds on previous knowledge.', 2),
    ('The lesson fits into the broader backwards-designed course.', 3)
  ) as v(t, i)
  where not exists (select 1 from public.framework_indicators fi where fi.domain_id = dom and fi.title = v.t);

  -- Pillar 2: Teaching Lessons
  select id into dom from public.framework_domains where framework_id = fw and title = 'Teaching Lessons' limit 1;
  if dom is null then
    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Teaching Lessons', 'Evidence-informed practices, effortful thinking, joyful learning.', 2)
    returning id into dom;
  end if;
  insert into public.framework_indicators (domain_id, title, order_index)
  select dom, v.t, v.i from (values
    ('The space is set up to maximize engagement.', 1),
    ('Evidence-informed practices are in use (scaffolding, clear explanations, practicing recall and memory).', 2),
    ('High expectations are paired with actionable feedback and support.', 3),
    ('Students are actively engaged in effortful, productive thinking.', 4),
    ('Tasks encourage intellectual challenge (e.g., applying skills to novel contexts).', 5)
  ) as v(t, i)
  where not exists (select 1 from public.framework_indicators fi where fi.domain_id = dom and fi.title = v.t);

  -- Pillar 3: Building Relationships
  select id into dom from public.framework_domains where framework_id = fw and title = 'Building Relationships' limit 1;
  if dom is null then
    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Building Relationships', 'Knowing each student and differentiating for the actual learners in the room.', 3)
    returning id into dom;
  end if;
  insert into public.framework_indicators (domain_id, title, order_index)
  select dom, v.t, v.i from (values
    ('The teacher demonstrates deep knowledge of individual students, including their strengths, needs, and identities.', 1),
    ('Instruction and support are differentiated for the actual children present.', 2),
    ('Peer-to-peer and teacher–student interactions show mutual warmth and respect.', 3)
  ) as v(t, i)
  where not exists (select 1 from public.framework_indicators fi where fi.domain_id = dom and fi.title = v.t);

  -- Pillar 4: Modeling Virtues
  select id into dom from public.framework_domains where framework_id = fw and title = 'Modeling Virtues' limit 1;
  if dom is null then
    insert into public.framework_domains (framework_id, title, description, order_index)
    values (fw, 'Modeling Virtues', 'Practicing dignity, kindness, curiosity, humility, and courage.', 4)
    returning id into dom;
  end if;
  insert into public.framework_indicators (domain_id, title, order_index)
  select dom, v.t, v.i from (values
    ('The teacher models respect for the inherent dignity of all community members, emphasizing community values.', 1),
    ('The teacher models curiosity, open-mindedness, and a love of learning.', 2),
    ('The teacher handles challenges or mistakes with patience, humility, and grace.', 3),
    ('Classroom norms and expectations are clear and reinforced.', 4),
    ('Content invites ethical reflection or multiple thoughtful perspectives.', 5)
  ) as v(t, i)
  where not exists (select 1 from public.framework_indicators fi where fi.domain_id = dom and fi.title = v.t);
end $$;
