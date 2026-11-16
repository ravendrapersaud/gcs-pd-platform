-- Department workspaces (fills the non-supervisor's second dashboard tile).
-- A workspace with kind='department' + rule_department=<dept> is the shared
-- space for everyone in that department (across divisions). Two paths provision
-- them, both deduped on lower(rule_department):
--   * ensure_department_workspace()  — lazy, self-service: the signed-in user
--     gets (creating if needed) their own department space on first open.
--   * provision_department_workspaces(min) — admin bulk, for summer setup.
-- Both SECURITY DEFINER so a staff user can create their own shared space
-- despite the "supervisor/admin only" insert RLS; created_by is left null so
-- nobody individually owns a shared department space (admins manage them).
-- Idempotent.

-- 1. Allow kind='department'
alter table public.workspaces drop constraint if exists workspaces_kind_check;
alter table public.workspaces
  add constraint workspaces_kind_check check (kind in ('team', 'committee', 'department'));

-- 2. One department workspace per department name
create unique index if not exists uq_department_workspace
  on public.workspaces (lower(rule_department))
  where kind = 'department';

-- 3. Lazy self-service: ensure the caller's department space exists, return its id
create or replace function public.ensure_department_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dept  text;
  ws_id uuid;
begin
  select nullif(btrim(department), '') into dept
  from public.profiles where id = auth.uid();
  if dept is null then
    return null;  -- no department set → nothing to open
  end if;

  select id into ws_id
  from public.workspaces
  where kind = 'department' and lower(rule_department) = lower(dept)
  limit 1;

  if ws_id is null then
    insert into public.workspaces (name, description, rule_department, kind, created_by)
    values (dept, dept || ' department space', dept, 'department', null)
    returning id into ws_id;
    perform public.sync_workspace_members(ws_id);
  else
    -- department may have grown since last sync; make sure caller is in it
    insert into public.workspace_members (workspace_id, user_id, added_via)
    values (ws_id, auth.uid(), 'rule')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return ws_id;
end;
$$;

-- 4. Admin bulk provisioning (summer setup). Skips departments below min_members.
create or replace function public.provision_department_workspaces(min_members int default 2)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r             record;
  ws_id         uuid;
  created       int := 0;
  existed       int := 0;
  skipped       int := 0;
  created_names text[] := '{}';
begin
  if public.get_user_role() <> 'admin' then
    raise exception 'Only admins can provision department workspaces';
  end if;

  for r in
    select nullif(btrim(department), '') as dept, count(*) as n
    from public.profiles
    where nullif(btrim(department), '') is not null
    group by nullif(btrim(department), '')
  loop
    if r.n < min_members then
      skipped := skipped + 1;
      continue;
    end if;

    select id into ws_id
    from public.workspaces
    where kind = 'department' and lower(rule_department) = lower(r.dept)
    limit 1;

    if ws_id is null then
      insert into public.workspaces (name, description, rule_department, kind, created_by)
      values (r.dept, r.dept || ' department space', r.dept, 'department', null)
      returning id into ws_id;
      created := created + 1;
      created_names := array_append(created_names, r.dept);
    else
      existed := existed + 1;
    end if;

    perform public.sync_workspace_members(ws_id);
  end loop;

  return jsonb_build_object(
    'created', created,
    'existed', existed,
    'skipped_singletons', skipped,
    'min_members', min_members,
    'created_names', created_names
  );
end;
$$;

grant execute on function public.ensure_department_workspace() to authenticated;
grant execute on function public.provision_department_workspaces(int) to authenticated;
