-- ============================================================
-- GCS PD Platform — Seed Data
-- Run in Supabase SQL editor after applying schema.sql.
-- For local dev only. Do NOT run in production.
-- ============================================================

-- Fixed UUIDs for test users
-- Ravendra Persaud  : aa000000-0000-0000-0000-000000000001
-- Kim Chaloner         : aa000000-0000-0000-0000-000000000002
-- Kim Lee           : aa000000-0000-0000-0000-000000000003
-- Alex Kim          : aa000000-0000-0000-0000-000000000004
-- Sarah Chen        : aa000000-0000-0000-0000-000000000005

-- ── Auth users ───────────────────────────────────────────────
-- NOTE: In hosted Supabase you cannot directly insert into auth.users easily.
-- Use the Supabase dashboard "Authentication > Users > Add user" for each,
-- or use the service-role API. The inserts below work for local supabase dev.

-- IMPORTANT: instance_id must be the all-zeros UUID, otherwise Supabase
-- hides these users from the Auth dashboard AND login lookups fail.
insert into auth.users (
  instance_id, id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-0000-0000-000000000001',
    'ravendra@gcschool.org',
    crypt('Password123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ravendra Persaud"}',
    'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-0000-0000-000000000002',
    'kchaloner@gcschool.org',
    crypt('Password123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Kim Chaloner"}',
    'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-0000-0000-000000000003',
    'kim@gcschool.org',
    crypt('Password123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Kim Lee"}',
    'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-0000-0000-000000000004',
    'alex@gcschool.org',
    crypt('Password123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alex Kim"}',
    'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-0000-0000-000000000005',
    'sarah@gcschool.org',
    crypt('Password123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sarah Chen"}',
    'authenticated', 'authenticated',
    '', '', '', ''
  )
on conflict (id) do nothing;

-- Email identities (required for email/password login on hosted Supabase)
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like '%@gcschool.org'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- ── Profiles ──────────────────────────────────────────────────
insert into public.profiles (id, email, first_name, last_name, role, title, division, department, employee_id) values
  (
    'aa000000-0000-0000-0000-000000000001',
    'ravendra@gcschool.org',
    'Ravendra', 'Persaud',
    'supervisor',
    'Senior Director of Academic Systems',
    'All School',
    'Technology',
    'EMP-001'
  ),
  (
    'aa000000-0000-0000-0000-000000000002',
    'kchaloner@gcschool.org',
    'Kim', 'Chaloner',
    'supervisor',
    'Dean of Faculty',
    'All School',
    'Academic Administration',
    'EMP-002'
  ),
  (
    'aa000000-0000-0000-0000-000000000003',
    'kim@gcschool.org',
    'Kim', 'Lee',
    'supervisor',
    'High School Division Head',
    'High School',
    'Leadership',
    'EMP-003'
  ),
  (
    'aa000000-0000-0000-0000-000000000004',
    'alex@gcschool.org',
    'Alex', 'Kim',
    'staff',
    'IT Technician',
    'All School',
    'Technology',
    'EMP-004'
  ),
  (
    'aa000000-0000-0000-0000-000000000005',
    'sarah@gcschool.org',
    'Sarah', 'Chen',
    'staff',
    'High School English Teacher',
    'High School',
    'English',
    'EMP-005'
  )
on conflict (id) do update set
  email = excluded.email,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  role = excluded.role,
  title = excluded.title,
  division = excluded.division,
  department = excluded.department,
  employee_id = excluded.employee_id;

-- ── Supervisor assignments ────────────────────────────────────
insert into public.supervisor_assignments (staff_id, supervisor_id, is_primary) values
  -- Alex Kim is supervised by Ravendra Persaud (primary)
  ('aa000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000001', true),
  -- Sarah Chen is supervised by Kim Chaloner (primary)
  ('aa000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000002', true),
  -- Sarah Chen also reports to Kim Lee (secondary - High School)
  ('aa000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000003', false)
on conflict (staff_id, supervisor_id) do nothing;

-- ── Resources ─────────────────────────────────────────────────
insert into public.resources (id, title, description, url, type, tags, submitted_by, is_approved) values
  (
    'bb000000-0000-0000-0000-000000000001',
    'Culturally Responsive Teaching: A Guide for School Leaders',
    'An evidence-based framework for implementing CRT practices across K-12 classrooms, with practical strategies for all disciplines.',
    'https://www.edutopia.org/culturally-responsive-teaching',
    'article',
    array['DEI', 'Teaching Practice', 'Leadership'],
    'aa000000-0000-0000-0000-000000000002',
    true
  ),
  (
    'bb000000-0000-0000-0000-000000000002',
    'Google Workspace for Education Certification',
    'Free self-paced certification program covering Google Classroom, Drive, Docs, Meet, and more for educators.',
    'https://edu.google.com/teacher-center/certifications/',
    'certificate',
    array['Technology', 'Certification', 'Google', 'Self-Paced'],
    'aa000000-0000-0000-0000-000000000001',
    true
  )
on conflict (id) do nothing;

-- ── Goals ─────────────────────────────────────────────────────
insert into public.goals (id, title, description, owner_id, due_date, progress_pct, status) values
  (
    'cc000000-0000-0000-0000-000000000001',
    'Implement AI literacy curriculum across High School',
    'Develop and pilot a cross-disciplinary AI literacy module in grades 9-12, in collaboration with the Tech and English departments. Align with ISTE standards.',
    'aa000000-0000-0000-0000-000000000001',
    '2025-06-15',
    40,
    'active'
  ),
  (
    'cc000000-0000-0000-0000-000000000002',
    'Complete National Board Certification portfolio',
    'Submit all required components of the National Board for Professional Teaching Standards certification portfolio by the December deadline.',
    'aa000000-0000-0000-0000-000000000005',
    '2025-12-01',
    25,
    'active'
  )
on conflict (id) do nothing;

-- Goal collaborator: Sarah Chen contributes to Ravendra's AI literacy goal
insert into public.goal_collaborators (goal_id, user_id) values
  ('cc000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000005')
on conflict do nothing;

-- Goal updates
insert into public.goal_updates (id, goal_id, author_id, content, progress_pct) values
  (
    'dd000000-0000-0000-0000-000000000001',
    'cc000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-000000000001',
    'Completed initial curriculum mapping with Dept. Heads. Framework draft shared via Google Drive.',
    40
  )
on conflict (id) do nothing;

-- ── PD Activity ───────────────────────────────────────────────
insert into public.pd_activities (id, user_id, title, type, activity_date, hours, notes, verified) values
  (
    'ee000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-000000000005',
    'NCTE Annual Convention — Chicago',
    'conference',
    '2024-11-21',
    18.0,
    'Attended sessions on AP English Language redesign and inquiry-based writing pedagogy.',
    true
  ),
  (
    'ee000000-0000-0000-0000-000000000002',
    'aa000000-0000-0000-0000-000000000004',
    'CompTIA A+ Certification Study',
    'course',
    '2024-10-01',
    40.0,
    'Self-paced online course via CompTIA CertMaster.',
    false
  )
on conflict (id) do nothing;

-- ── Spotlight ─────────────────────────────────────────────────
insert into public.spotlights (id, from_user_id, to_user_id, message, tags, email_sent) values
  (
    'ff000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-000000000005',
    'Sarah went above and beyond to integrate technology into her AP English course this semester. Her students produced multimedia essay projects that showcased both literary analysis and digital storytelling skills. Truly inspiring work!',
    array['Innovation', 'Student-Centered Learning', 'Technology Integration'],
    false
  )
on conflict (id) do nothing;

-- ── Framework ─────────────────────────────────────────────────
insert into public.frameworks (id, title, division, department, description, created_by) values
  (
    '11000000-0000-0000-0000-000000000001',
    'GCS Teaching Excellence Framework',
    'High School',
    'All Departments',
    'A comprehensive rubric for classroom observation and professional growth aligned to GCS instructional priorities.',
    'aa000000-0000-0000-0000-000000000002'
  )
on conflict (id) do nothing;

insert into public.framework_domains (id, framework_id, title, description, order_index) values
  (
    '22000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Learning Environment',
    'The physical and emotional environment that supports student learning, belonging, and risk-taking.',
    1
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001',
    'Instructional Design',
    'Planning and delivery of lessons that are rigorous, engaging, and differentiated for diverse learners.',
    2
  ),
  (
    '22000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000001',
    'Assessment for Learning',
    'Use of formative and summative data to inform instruction and provide meaningful feedback to students.',
    3
  )
on conflict (id) do nothing;

insert into public.framework_indicators (id, domain_id, title, description, order_index) values
  ('33000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Inclusive Classroom Culture', 'Creates a safe, welcoming environment where every student feels seen and valued.', 1),
  ('33000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', 'Classroom Management', 'Establishes clear routines and expectations that maximize learning time.', 2),
  ('33000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000002', 'Learning Objectives Clarity', 'Communicates clear, measurable learning targets aligned to standards.', 1),
  ('33000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000002', 'Differentiation', 'Adjusts instruction to meet the varied needs, interests, and readiness levels of all students.', 2),
  ('33000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000003', 'Formative Assessment Practices', 'Regularly uses formative checks to gauge understanding and adjust pacing.', 1),
  ('33000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000003', 'Feedback Quality', 'Provides timely, specific, and actionable feedback that advances student learning.', 2)
on conflict (id) do nothing;

-- ── Observation ───────────────────────────────────────────────
insert into public.observations (id, observer_id, observed_id, framework_id, obs_type, observed_at, notes, signed_off) values
  (
    '44000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-000000000002',
    'aa000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000001',
    'formal',
    now() - interval '10 days',
    'Observed Sarah''s AP English 11 class during a Socratic seminar on The Great Gatsby. Students were highly engaged and demonstrated strong analytical thinking. Sarah skillfully facilitated without over-directing.',
    false
  )
on conflict (id) do nothing;

insert into public.observation_ratings (observation_id, domain_id, rating, notes) values
  ('44000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 4, 'Exceptional inclusive culture; students supported one another actively.'),
  ('44000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 3, 'Well-planned lesson with clear objectives; minor pacing adjustments recommended.'),
  ('44000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000003', 4, 'Strong formative practices throughout; exit ticket was insightful.')
on conflict (observation_id, domain_id) do nothing;
