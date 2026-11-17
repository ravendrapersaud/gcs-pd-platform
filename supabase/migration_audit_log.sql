-- ============================================================
-- GCS PD Platform — Admin audit log (trust core)
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- An append-only record of consequential admin actions, for transparency
-- and staff/faculty trust. Rows are written ONLY by SECURITY DEFINER
-- triggers that stamp the REAL actor (auth.uid()) inside the database, so
-- they can't be forged by a client. Admins read everything; each person
-- reads the entries that touched THEIR record (target_user_id = them).
--
-- v1 "trust core": profile changes (role/allotment/employee type/capability
-- flags), funding (admin cost add/edit/delete, approve/deny), and school-wide
-- Settings changes. Mirrors email_log (append-only, admin-readable).
-- ============================================================

-- ── 1. Table ──────────────────────────────────────────────────
create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,                 -- e.g. 'profile.update', 'funding.update', 'settings.update'
  actor_id       uuid references public.profiles(id) on delete set null,  -- who did it (auth.uid())
  target_type    text,                          -- 'profile' | 'funding_request' | 'app_setting'
  target_id      uuid,                          -- the affected row (null for app_settings)
  target_user_id uuid references public.profiles(id) on delete set null,  -- whose record (drives self-visibility)
  summary        text,                          -- human-readable one-liner
  changes        jsonb,                         -- { field: { from, to } }
  created_at     timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_target_user_idx on public.audit_log(target_user_id);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id);

-- ── 2. RLS: admins read all; each person reads their own. No client writes. ──
alter table public.audit_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_log'
    and policyname='Admins and self read audit log') then
    create policy "Admins and self read audit log"
      on public.audit_log for select
      using (public.get_user_role() = 'admin' or target_user_id = auth.uid());
  end if;
end $$;
-- (No INSERT/UPDATE/DELETE policies → rows can only be written by the
--  SECURITY DEFINER triggers below, and never edited or removed.)

-- ── 3. Capture triggers (SECURITY DEFINER; actor = auth.uid()) ──

-- Profiles: sensitive fields only.
create or replace function public.audit_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'::jsonb; parts text[] := '{}';
begin
  if new.role is distinct from old.role then
    ch := ch || jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role));
    parts := parts || ('role: ' || coalesce(old.role::text,'—') || ' → ' || coalesce(new.role::text,'—'));
  end if;
  if new.pd_allotment is distinct from old.pd_allotment then
    ch := ch || jsonb_build_object('pd_allotment', jsonb_build_object('from', old.pd_allotment, 'to', new.pd_allotment));
    parts := parts || ('allotment: ' || coalesce(old.pd_allotment::text,'default') || ' → ' || coalesce(new.pd_allotment::text,'default'));
  end if;
  if new.employee_type is distinct from old.employee_type then
    ch := ch || jsonb_build_object('employee_type', jsonb_build_object('from', old.employee_type, 'to', new.employee_type));
    parts := parts || ('employee type: ' || coalesce(old.employee_type,'—') || ' → ' || coalesce(new.employee_type,'—'));
  end if;
  if new.can_create_workspaces is distinct from old.can_create_workspaces then
    ch := ch || jsonb_build_object('can_create_workspaces', jsonb_build_object('from', old.can_create_workspaces, 'to', new.can_create_workspaces));
    parts := parts || ('can_create_workspaces → ' || new.can_create_workspaces::text);
  end if;
  if new.can_approve_events is distinct from old.can_approve_events then
    ch := ch || jsonb_build_object('can_approve_events', jsonb_build_object('from', old.can_approve_events, 'to', new.can_approve_events));
    parts := parts || ('can_approve_events → ' || new.can_approve_events::text);
  end if;
  if new.can_manage_cohorts is distinct from old.can_manage_cohorts then
    ch := ch || jsonb_build_object('can_manage_cohorts', jsonb_build_object('from', old.can_manage_cohorts, 'to', new.can_manage_cohorts));
    parts := parts || ('can_manage_cohorts → ' || new.can_manage_cohorts::text);
  end if;
  if new.can_manage_funds is distinct from old.can_manage_funds then
    ch := ch || jsonb_build_object('can_manage_funds', jsonb_build_object('from', old.can_manage_funds, 'to', new.can_manage_funds));
    parts := parts || ('can_manage_funds → ' || new.can_manage_funds::text);
  end if;
  if new.track is distinct from old.track then
    ch := ch || jsonb_build_object('track', jsonb_build_object('from', old.track, 'to', new.track));
    parts := parts || ('track: ' || coalesce(old.track,'—') || ' → ' || coalesce(new.track,'—'));
  end if;
  if new.campus is distinct from old.campus then
    ch := ch || jsonb_build_object('campus', jsonb_build_object('from', old.campus, 'to', new.campus));
    parts := parts || ('campus: ' || coalesce(old.campus,'—') || ' → ' || coalesce(new.campus,'—'));
  end if;
  if new.teaches_classes is distinct from old.teaches_classes then
    ch := ch || jsonb_build_object('teaches_classes', jsonb_build_object('from', old.teaches_classes, 'to', new.teaches_classes));
    parts := parts || ('teaches_classes → ' || coalesce(new.teaches_classes::text,'—'));
  end if;
  if new.roles is distinct from old.roles then
    ch := ch || jsonb_build_object('roles', jsonb_build_object('from', to_jsonb(old.roles), 'to', to_jsonb(new.roles)));
    parts := parts || 'scoped roles updated';
  end if;

  if ch <> '{}'::jsonb then
    insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
    values ('profile.update', auth.uid(), 'profile', new.id, new.id, array_to_string(parts, '; '), ch);
  end if;
  return new;
end;
$$;

create or replace trigger audit_profiles_trg after update on public.profiles
  for each row execute function public.audit_profiles();

-- Funding: admin-entered inserts, status/amount/source changes, deletes.
create or replace function public.audit_funding()
returns trigger language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'::jsonb; parts text[] := '{}';
begin
  if TG_OP = 'INSERT' then
    if new.admin_entered then
      insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
      values ('funding.insert', coalesce(auth.uid(), new.created_by), 'funding_request', new.id, new.user_id,
              'Added cost: ' || coalesce(new.title,'(untitled)') || ' $' || coalesce(new.amount::text,'0')
                || ' (' || coalesce(new.fund_source,'personal') || ', ' || new.status || ')', null);
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
    values ('funding.delete', auth.uid(), 'funding_request', old.id, old.user_id,
            'Deleted cost: ' || coalesce(old.title,'(untitled)') || ' $' || coalesce(old.amount::text,'0'), null);
    return old;
  else
    if new.status is distinct from old.status then
      ch := ch || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
      parts := parts || ('status: ' || old.status || ' → ' || new.status);
    end if;
    if new.amount is distinct from old.amount then
      ch := ch || jsonb_build_object('amount', jsonb_build_object('from', old.amount, 'to', new.amount));
      parts := parts || ('amount: $' || old.amount::text || ' → $' || new.amount::text);
    end if;
    if new.fund_source is distinct from old.fund_source then
      ch := ch || jsonb_build_object('fund_source', jsonb_build_object('from', old.fund_source, 'to', new.fund_source));
      parts := parts || ('source: ' || coalesce(old.fund_source,'personal') || ' → ' || coalesce(new.fund_source,'personal'));
    end if;
    if ch <> '{}'::jsonb then
      insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
      values ('funding.update', coalesce(auth.uid(), new.reviewed_by), 'funding_request', new.id, new.user_id,
              coalesce(new.title,'(untitled)') || ' — ' || array_to_string(parts, '; '), ch);
    end if;
    return new;
  end if;
end;
$$;

create or replace trigger audit_funding_trg after insert or update or delete on public.funding_requests
  for each row execute function public.audit_funding();

-- Settings: log only when a value actually changes.
create or replace function public.audit_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
    values ('settings.update', coalesce(auth.uid(), new.updated_by), 'app_setting', null, null,
            new.key || ': set to "' || left(coalesce(new.value,''), 120) || '"',
            jsonb_build_object('value', jsonb_build_object('from', null, 'to', new.value)));
    return new;
  elsif new.value is distinct from old.value then
    insert into public.audit_log(action, actor_id, target_type, target_id, target_user_id, summary, changes)
    values ('settings.update', coalesce(auth.uid(), new.updated_by), 'app_setting', null, null,
            new.key || ': "' || left(coalesce(old.value,''),60) || '" → "' || left(coalesce(new.value,''),60) || '"',
            jsonb_build_object('value', jsonb_build_object('from', old.value, 'to', new.value)));
    return new;
  end if;
  return new;
end;
$$;

create or replace trigger audit_settings_trg after insert or update on public.app_settings
  for each row execute function public.audit_settings();
