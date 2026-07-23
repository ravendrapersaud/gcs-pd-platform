-- ── Resource owner editing (idempotent) ─────────────────────────────
-- Submitters can edit and delete their own resources. Admins already
-- have full control via the existing "Admins manage resources" policy.
-- (Already applied to the live DB via the Supabase connector.)

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'resources'
      and policyname = 'Submitters can update own resources'
  ) then
    create policy "Submitters can update own resources"
      on public.resources for update
      to authenticated
      using (submitted_by = auth.uid())
      with check (submitted_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'resources'
      and policyname = 'Submitters can delete own resources'
  ) then
    create policy "Submitters can delete own resources"
      on public.resources for delete
      to authenticated
      using (submitted_by = auth.uid());
  end if;
end
$$;
