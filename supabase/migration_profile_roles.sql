-- Revised employee profile — Phase 1 (data only; no permission changes yet).
-- Adds campus, teaches_classes, and a multi-value roles array. The seven-role
-- scoped-reach model is seeded from today's access level so you can start
-- assigning real roles in the Roster; the app still gates on `role` for now.
-- Idempotent.

alter table public.profiles add column if not exists campus          text;      -- '86' | '46'
alter table public.profiles add column if not exists teaches_classes boolean;
alter table public.profiles add column if not exists roles           text[] not null default '{}';

-- Seed roles from the current access level (only where none set yet):
--   admin → Full Access, supervisor → Senior Administrator,
--   faculty → Faculty, everyone else → Staff.
update public.profiles set roles = case
  when role = 'admin'      then array['Full Access']
  when role = 'supervisor' then array['Senior Administrator']
  when employee_type = 'faculty' then array['Faculty']
  else array['Staff']
end
where coalesce(array_length(roles, 1), 0) = 0;

-- Auto-fill campus from division (86 = EC/LS/MS, 46 = HS). Leaves campus null
-- for non-teaching staff with no division — set those by hand in the Roster.
update public.profiles set campus = case
  when lower(coalesce(division, '')) like '%high%'                          then '46'
  when lower(coalesce(division, '')) ~ 'early|lower|middle'                 then '86'
  else campus
end
where campus is null;

-- Teaching faculty teach classes by definition; the Yes/No flag mainly
-- distinguishes teaching vs non-teaching among non-faculty Staff.
update public.profiles set teaches_classes = true
where employee_type = 'faculty' and teaches_classes is null;
