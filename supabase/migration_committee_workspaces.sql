-- Committees-as-Workspaces (Service & Community phase 2): a workspace can be
-- marked a "committee" so standing committees (DEI, Safety, Social/Cultural…)
-- are real collaborative spaces (membership + a chair = manager + posts/files),
-- and a person's committee memberships surface on their portfolio straight from
-- workspace_members. No new RLS — the existing workspaces update policy
-- (creator / manager / admin) already governs who can set `kind`, and membership
-- is already readable. Idempotent.

alter table public.workspaces add column if not exists kind text not null default 'team';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_kind_check') then
    alter table public.workspaces add constraint workspaces_kind_check check (kind in ('team', 'committee'));
  end if;
end $$;
