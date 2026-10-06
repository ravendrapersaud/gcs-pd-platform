-- ── Observation delete permission (idempotent) ──────────────────────
-- Observers can delete their own observations (drafts or published);
-- admins can delete any. observation_ratings cascade with the row.
-- Without this policy RLS blocks every delete.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'observations'
      and policyname = 'Observers and admins delete observations'
  ) then
    create policy "Observers and admins delete observations"
      on public.observations for delete
      using (auth.uid() = observer_id or get_user_role() = 'admin');
  end if;
end $$;
