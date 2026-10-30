-- Public favorites for the Resource Library.
-- Lets a user opt in to sharing their favorites with colleagues, and lets
-- colleagues view the favorites of anyone who opted in. Idempotent.

-- 1) Opt-in flag on profiles. Default off = favorites stay private.
alter table public.profiles
  add column if not exists favorites_public boolean not null default false;

-- 2) Allow authenticated users to read the favorites of opted-in colleagues.
--    The existing "Users manage own favorites" (FOR ALL, auth.uid() = user_id)
--    still covers your own rows whether public or not. This policy is OR-ed on
--    top for SELECT only, and only exposes rows of users who opted in.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'resource_favorites'
      and policyname = 'View public favorites'
  ) then
    create policy "View public favorites"
      on public.resource_favorites for select
      using (
        exists (
          select 1 from public.profiles p
          where p.id = resource_favorites.user_id
            and coalesce(p.favorites_public, false) = true
        )
      );
  end if;
end $$;
