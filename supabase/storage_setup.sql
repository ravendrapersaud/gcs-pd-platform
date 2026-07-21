-- ============================================================
-- GCS PD Platform — Storage setup for resource cover uploads
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Creates a PUBLIC "resource-covers" bucket and the policies that
-- let signed-in users upload cover images and let anyone view them.
-- (You can also create the bucket via the dashboard: Storage →
--  New bucket → name "resource-covers" → toggle Public → Save.)
-- ============================================================

-- 1. Create the public bucket
insert into storage.buckets (id, name, public)
values ('resource-covers', 'resource-covers', true)
on conflict (id) do nothing;

-- 2. Policies on storage.objects for this bucket (guarded so re-runs don't error)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public can view resource covers'
  ) then
    create policy "Public can view resource covers"
      on storage.objects for select
      using (bucket_id = 'resource-covers');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated can upload resource covers'
  ) then
    create policy "Authenticated can upload resource covers"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'resource-covers');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated can update resource covers'
  ) then
    create policy "Authenticated can update resource covers"
      on storage.objects for update to authenticated
      using (bucket_id = 'resource-covers')
      with check (bucket_id = 'resource-covers');
  end if;
end $$;
