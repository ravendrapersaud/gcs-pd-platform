-- ============================================================
-- GCS PD Platform — Collaborative Workspaces
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Adds: profiles.can_create_workspaces, workspaces,
-- workspace_members, workspace_posts, workspace_files,
-- sync_workspace_members() rule-sync function, RLS policies,
-- the 'workspace-files' storage bucket, and demo seed data.
-- ============================================================

-- ── 1. Grantable creation permission on profiles ─────────────
alter table public.profiles
  add column if not exists can_create_workspaces boolean not null default false;

-- ── 2. Tables ─────────────────────────────────────────────────
create table if not exists public.workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  -- auto-membership rules (null = no rule on that field):
  rule_division      text,      -- e.g. 'Middle School'
  rule_department    text,      -- e.g. 'Mathematics'
  rule_employee_type text,      -- 'faculty' | 'staff' | null
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  is_manager   boolean not null default false,
  added_via    text not null default 'manual',  -- 'manual' | 'rule'
  created_at   timestamptz default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_posts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete cascade,
  title        text,               -- optional, e.g. "Math Dept Meeting 9/12 Notes"
  content      text not null,
  is_pinned    boolean not null default false,
  created_at   timestamptz default now()
);

create table if not exists public.workspace_files (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  post_id      uuid references public.workspace_posts(id) on delete set null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  name         text not null,
  file_url     text,      -- Supabase storage public URL (traditional upload)
  drive_url    text,      -- Google Drive/Docs/Sheets/Slides URL
  drive_icon   text,      -- 'doc'|'sheet'|'slide'|'form'|'pdf'|'file'
  size_bytes   bigint,
  created_at   timestamptz default now()
);

create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_workspace_posts_workspace on public.workspace_posts(workspace_id);
create index if not exists idx_workspace_posts_created on public.workspace_posts(created_at desc);
create index if not exists idx_workspace_files_workspace on public.workspace_files(workspace_id);
create index if not exists idx_workspace_files_post on public.workspace_files(post_id);

-- ── 3. Helper functions (security definer, avoid RLS recursion) ──
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_manager(ws uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid() and is_manager
  );
$$;

-- Sync rule-based members: inserts (added_via='rule') every profile
-- matching ALL non-null rules. Returns the number of members added.
create or replace function public.sync_workspace_members(ws_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  ws    public.workspaces%rowtype;
  added int := 0;
begin
  select * into ws from public.workspaces where id = ws_id;
  if not found then
    return 0;
  end if;
  if ws.rule_division is null and ws.rule_department is null and ws.rule_employee_type is null then
    return 0;
  end if;

  with ins as (
    insert into public.workspace_members (workspace_id, user_id, added_via)
    select ws_id, p.id, 'rule'
    from public.profiles p
    where (ws.rule_division is null or p.division = ws.rule_division)
      and (ws.rule_department is null or p.department = ws.rule_department)
      and (ws.rule_employee_type is null or p.employee_type = ws.rule_employee_type)
    on conflict (workspace_id, user_id) do nothing
    returning 1
  )
  select count(*) into added from ins;

  return added;
end;
$$;

grant execute on function public.sync_workspace_members(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_manager(uuid) to authenticated;

-- ── 4. RLS ────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_posts enable row level security;
alter table public.workspace_files enable row level security;

-- workspaces --------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
      and policyname = 'Authenticated users can browse workspaces'
  ) then
    create policy "Authenticated users can browse workspaces"
      on public.workspaces for select
      using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
      and policyname = 'Permitted users can create workspaces'
  ) then
    create policy "Permitted users can create workspaces"
      on public.workspaces for insert
      with check (
        get_user_role() in ('supervisor', 'admin')
        or coalesce(
          (select can_create_workspaces from public.profiles where id = auth.uid()),
          false
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
      and policyname = 'Creator, managers, admins can update workspaces'
  ) then
    create policy "Creator, managers, admins can update workspaces"
      on public.workspaces for update
      using (
        created_by = auth.uid()
        or get_user_role() = 'admin'
        or public.is_workspace_manager(id)
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
      and policyname = 'Creator, managers, admins can delete workspaces'
  ) then
    create policy "Creator, managers, admins can delete workspaces"
      on public.workspaces for delete
      using (
        created_by = auth.uid()
        or get_user_role() = 'admin'
        or public.is_workspace_manager(id)
      );
  end if;
end $$;

-- workspace_members -------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and policyname = 'Authenticated users can view workspace members'
  ) then
    create policy "Authenticated users can view workspace members"
      on public.workspace_members for select
      using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and policyname = 'Managers, creators, supervisors, admins manage members'
  ) then
    create policy "Managers, creators, supervisors, admins manage members"
      on public.workspace_members for all
      using (
        get_user_role() in ('supervisor', 'admin')
        or public.is_workspace_manager(workspace_id)
        or exists (
          select 1 from public.workspaces w
          where w.id = workspace_id and w.created_by = auth.uid()
        )
      )
      with check (
        get_user_role() in ('supervisor', 'admin')
        or public.is_workspace_manager(workspace_id)
        or exists (
          select 1 from public.workspaces w
          where w.id = workspace_id and w.created_by = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and policyname = 'Users can join workspaces themselves'
  ) then
    create policy "Users can join workspaces themselves"
      on public.workspace_members for insert
      with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
      and policyname = 'Users can leave workspaces themselves'
  ) then
    create policy "Users can leave workspaces themselves"
      on public.workspace_members for delete
      using (user_id = auth.uid());
  end if;
end $$;

-- workspace_posts ----------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_posts'
      and policyname = 'Members and admins can view posts'
  ) then
    create policy "Members and admins can view posts"
      on public.workspace_posts for select
      using (
        public.is_workspace_member(workspace_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_posts'
      and policyname = 'Members can create posts'
  ) then
    create policy "Members can create posts"
      on public.workspace_posts for insert
      with check (
        author_id = auth.uid()
        and public.is_workspace_member(workspace_id)
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_posts'
      and policyname = 'Authors, managers, admins can update posts'
  ) then
    create policy "Authors, managers, admins can update posts"
      on public.workspace_posts for update
      using (
        author_id = auth.uid()
        or public.is_workspace_manager(workspace_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_posts'
      and policyname = 'Authors, managers, admins can delete posts'
  ) then
    create policy "Authors, managers, admins can delete posts"
      on public.workspace_posts for delete
      using (
        author_id = auth.uid()
        or public.is_workspace_manager(workspace_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;

-- workspace_files ----------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_files'
      and policyname = 'Members and admins can view files'
  ) then
    create policy "Members and admins can view files"
      on public.workspace_files for select
      using (
        public.is_workspace_member(workspace_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_files'
      and policyname = 'Members can add files'
  ) then
    create policy "Members can add files"
      on public.workspace_files for insert
      with check (
        uploaded_by = auth.uid()
        and public.is_workspace_member(workspace_id)
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_files'
      and policyname = 'Uploaders, managers, admins can delete files'
  ) then
    create policy "Uploaders, managers, admins can delete files"
      on public.workspace_files for delete
      using (
        uploaded_by = auth.uid()
        or public.is_workspace_manager(workspace_id)
        or get_user_role() = 'admin'
      );
  end if;
end $$;

-- ── 5. Storage bucket for uploaded workspace files ────────────
insert into storage.buckets (id, name, public)
values ('workspace-files', 'workspace-files', true)
on conflict (id) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public can view workspace files'
  ) then
    create policy "Public can view workspace files"
      on storage.objects for select
      using (bucket_id = 'workspace-files');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated can upload workspace files'
  ) then
    create policy "Authenticated can upload workspace files"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'workspace-files');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated can update workspace files'
  ) then
    create policy "Authenticated can update workspace files"
      on storage.objects for update to authenticated
      using (bucket_id = 'workspace-files')
      with check (bucket_id = 'workspace-files');
  end if;
end $$;

-- ── 6. Seed data (skipped if the demo profiles don't exist) ───
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = 'aa000000-0000-0000-0000-000000000001'
  ) then
    return;
  end if;

  insert into public.workspaces
    (id, name, description, rule_division, rule_department, rule_employee_type, created_by)
  values
    (
      'dd000000-0000-0000-0000-000000000001',
      'High School Faculty',
      'All HS faculty — announcements, meeting notes, and shared resources.',
      'High School', null, 'faculty',
      'aa000000-0000-0000-0000-000000000003'
    ),
    (
      'dd000000-0000-0000-0000-000000000002',
      'Technology Team',
      'Tech department workspace for projects, docs, and meeting notes.',
      null, 'Technology', null,
      'aa000000-0000-0000-0000-000000000001'
    ),
    (
      'dd000000-0000-0000-0000-000000000003',
      'MS Math',
      'Middle School math teachers — curriculum planning and shared materials.',
      null, null, null,
      'aa000000-0000-0000-0000-000000000002'
    )
  on conflict (id) do nothing;

  -- Managers (manual) + one manual member
  insert into public.workspace_members (workspace_id, user_id, is_manager, added_via)
  values
    ('dd000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', true,  'manual'),
    ('dd000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', true,  'manual'),
    ('dd000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000002', true,  'manual'),
    ('dd000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000005', false, 'manual')
  on conflict (workspace_id, user_id) do nothing;

  -- Populate rule-based members for all workspaces
  perform public.sync_workspace_members(id) from public.workspaces;

  -- Seed posts
  insert into public.workspace_posts (id, workspace_id, author_id, title, content, is_pinned)
  values
    (
      'de000000-0000-0000-0000-000000000001',
      'dd000000-0000-0000-0000-000000000001',
      'aa000000-0000-0000-0000-000000000003',
      'Welcome',
      'Welcome to the High School Faculty workspace! This is our home for meeting notes, shared resources, and announcements. Post notes after each faculty meeting so colleagues who were out can catch up.',
      true
    ),
    (
      'de000000-0000-0000-0000-000000000002',
      'dd000000-0000-0000-0000-000000000002',
      'aa000000-0000-0000-0000-000000000001',
      'Tech Team Meeting 9/9 Notes',
      E'Agenda recap:\n- Rollout schedule for new projector carts (MS first, then LS)\n- PD platform launch feedback — send bugs to Ravendra\n- Reminder: inventory audit due end of month\n\nNext meeting: 9/23, Tech office.',
      false
    )
  on conflict (id) do nothing;

  -- Seed one Drive-linked file
  insert into public.workspace_files
    (id, workspace_id, uploaded_by, name, drive_url, drive_icon)
  values
    (
      'df000000-0000-0000-0000-000000000001',
      'dd000000-0000-0000-0000-000000000002',
      'aa000000-0000-0000-0000-000000000001',
      'Meeting agenda template',
      'https://docs.google.com/document/d/example',
      'doc'
    )
  on conflict (id) do nothing;
end $$;
