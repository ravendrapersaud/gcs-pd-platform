-- ── Taxonomy + platform settings migration (idempotent) ─────────────
-- Adds:
--   1. taxonomy_terms table (admin-manageable audiences/subjects/themes)
--      with RLS + seeds matching the previous hardcoded lists.
--   2. New app_settings rows: pd_hours_target, funding_admin_threshold,
--      allow_over_balance_requests, resource_moderation,
--      workspace_creation_policy.
--   3. Recreates the workspaces INSERT policy so admins can open
--      workspace creation to everyone via settings.
-- Safe to run multiple times.

-- ── 1. taxonomy_terms table ──────────────────────────────────────────
create table if not exists public.taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('audience','subject','theme')),
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (category, label)
);

create index if not exists idx_taxonomy_terms_category on public.taxonomy_terms(category, sort_order);

alter table public.taxonomy_terms enable row level security;

-- RLS policies (guarded so re-running doesn't fail)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taxonomy_terms'
      and policyname = 'Authenticated users can read taxonomy terms'
  ) then
    create policy "Authenticated users can read taxonomy terms"
      on public.taxonomy_terms for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taxonomy_terms'
      and policyname = 'Admins can insert taxonomy terms'
  ) then
    create policy "Admins can insert taxonomy terms"
      on public.taxonomy_terms for insert
      to authenticated
      with check (get_user_role() = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taxonomy_terms'
      and policyname = 'Admins can update taxonomy terms'
  ) then
    create policy "Admins can update taxonomy terms"
      on public.taxonomy_terms for update
      to authenticated
      using (get_user_role() = 'admin')
      with check (get_user_role() = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taxonomy_terms'
      and policyname = 'Admins can delete taxonomy terms'
  ) then
    create policy "Admins can delete taxonomy terms"
      on public.taxonomy_terms for delete
      to authenticated
      using (get_user_role() = 'admin');
  end if;
end
$$;

-- ── 2. Seed terms (mirrors lib/taxonomy.ts constants) ────────────────
insert into public.taxonomy_terms (category, label, sort_order) values
  -- audiences
  ('audience', 'Early Childhood', 0),
  ('audience', 'Lower School', 1),
  ('audience', 'Middle School', 2),
  ('audience', 'High School', 3),
  ('audience', 'Faculty', 4),
  ('audience', 'Staff', 5),
  ('audience', 'Administration', 6),
  ('audience', 'Technology', 7),
  ('audience', 'Communications', 8),
  ('audience', 'Advancement', 9),
  ('audience', 'College Office', 10),
  ('audience', 'Business Office', 11),
  ('audience', 'Athletics', 12),
  -- subjects
  ('subject', 'English', 0),
  ('subject', 'Mathematics', 1),
  ('subject', 'Science', 2),
  ('subject', 'History & Social Studies', 3),
  ('subject', 'World Languages', 4),
  ('subject', 'Arts', 5),
  ('subject', 'Physical Education & Health', 6),
  ('subject', 'Library', 7),
  ('subject', 'Computer Science', 8),
  ('subject', 'Interdisciplinary', 9),
  -- themes
  ('theme', 'Classroom Management', 0),
  ('theme', 'Assessment', 1),
  ('theme', 'Writing', 2),
  ('theme', 'Reading & Literacy', 3),
  ('theme', 'DEI', 4),
  ('theme', 'Social-Emotional Learning', 5),
  ('theme', 'AI & EdTech', 6),
  ('theme', 'Project-Based Learning', 7),
  ('theme', 'Leadership', 8),
  ('theme', 'Curriculum Design', 9),
  ('theme', 'Differentiation', 10),
  ('theme', 'Family Engagement', 11)
on conflict (category, label) do nothing;

-- ── 3. New settings rows (empty threshold = disabled) ────────────────
insert into public.app_settings (key, value) values
  ('pd_hours_target', '40'),
  ('funding_admin_threshold', ''),
  ('allow_over_balance_requests', 'true'),
  ('resource_moderation', 'off'),
  ('workspace_creation_policy', 'supervisors')
on conflict (key) do nothing;

-- ── 4. Workspace creation policy honors the setting ──────────────────
-- Recreate the INSERT policy so 'workspace_creation_policy' = 'everyone'
-- lets any authenticated user create a workspace. Supervisors/admins and
-- individually-granted users keep their access either way.
drop policy if exists "Permitted users can create workspaces" on public.workspaces;
create policy "Permitted users can create workspaces"
  on public.workspaces for insert
  to authenticated
  with check (
    get_user_role() in ('supervisor', 'admin')
    or coalesce(
      (select can_create_workspaces from public.profiles where id = auth.uid()),
      false
    )
    or exists (
      select 1 from public.app_settings
      where key = 'workspace_creation_policy' and value = 'everyone'
    )
  );
