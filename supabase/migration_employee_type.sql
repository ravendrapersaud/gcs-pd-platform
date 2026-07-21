-- ============================================================
-- GCS PD Platform — Migration: employee_type (faculty vs staff)
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- `role` controls access level (staff / supervisor / admin).
-- `employee_type` describes job type: 'faculty' (teaching) or
-- 'staff' (non-teaching). Used for the roster filter + CSV import.
-- ============================================================

alter table public.profiles add column if not exists employee_type text;

-- Backfill existing rows with a sensible guess:
-- teaching divisions -> faculty; everyone else -> staff.
update public.profiles
set employee_type = case
  when division in (
    'Early Childhood','Lower School','Middle School','High School','Upper School',
    'EC','LS','MS','HS'
  ) then 'faculty'
  else 'staff'
end
where employee_type is null;

-- Set the seeded test users explicitly.
update public.profiles set employee_type = 'staff'
  where email in ('ravendra@gcschool.org','alex@gcschool.org','kchaloner@gcschool.org');
update public.profiles set employee_type = 'faculty'
  where email in ('kim@gcschool.org','sarah@gcschool.org');

create index if not exists profiles_employee_type_idx on public.profiles(employee_type);
