-- ============================================================
-- GCS PD Platform — Auth fix for seeded test users
-- Run in the Supabase SQL editor AFTER schema.sql and seed.sql.
--
-- Why this is needed: a raw INSERT into auth.users (as seed.sql does)
-- is missing two things hosted Supabase requires for email/password
-- login to work:
--   1. a matching row in auth.identities (email provider)
--   2. non-null token columns (older seeds leave them NULL, which
--      makes GoTrue's row scan fail on login)
-- This script repairs both for every @gcschool.org test user and
-- (re)sets their password to: Password123!
-- ============================================================

-- 1. Reset password + confirm email + clear NULL token fields
--    (instance_id must be the all-zeros UUID or Supabase hides the users
--     from the Auth dashboard and login lookups fail)
update auth.users
set
  instance_id               = '00000000-0000-0000-0000-000000000000',
  encrypted_password        = crypt('Password123!', gen_salt('bf')),
  email_confirmed_at        = coalesce(email_confirmed_at, now()),
  confirmation_token        = coalesce(confirmation_token, ''),
  recovery_token            = coalesce(recovery_token, ''),
  email_change              = coalesce(email_change, ''),
  email_change_token_new    = coalesce(email_change_token_new, ''),
  email_change_token_current= coalesce(email_change_token_current, ''),
  phone_change              = coalesce(phone_change, ''),
  phone_change_token        = coalesce(phone_change_token, ''),
  reauthentication_token    = coalesce(reauthentication_token, ''),
  raw_app_meta_data         = '{"provider":"email","providers":["email"]}',
  updated_at                = now()
where email like '%@gcschool.org';

-- 2. Create the email identity row if it doesn't already exist
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  u.id::text,
  now(), now(), now()
from auth.users u
where u.email like '%@gcschool.org'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- 3. Confirm it worked — should list all 5 users with an email identity
select
  u.email,
  (u.email_confirmed_at is not null) as email_confirmed,
  (i.provider is not null)           as has_email_identity
from auth.users u
left join auth.identities i
  on i.user_id = u.id and i.provider = 'email'
where u.email like '%@gcschool.org'
order by u.email;
