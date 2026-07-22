-- ============================================================
-- GCS PD Platform — Migration: let supervisors/admins edit profiles
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Fixes: editing a user's title/division/etc. in the Staff Roster
-- silently saved nothing. The profiles table only had a
-- "update own profile" RLS policy, so updates to OTHER people's
-- rows matched zero rows (RLS filters, it doesn't error).
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Supervisors and admins can update profiles'
  ) then
    create policy "Supervisors and admins can update profiles"
      on public.profiles for update
      using (get_user_role() in ('supervisor', 'admin'))
      with check (get_user_role() in ('supervisor', 'admin'));
  end if;
end $$;
