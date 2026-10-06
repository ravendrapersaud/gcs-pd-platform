-- ── Observation drafts: status + draft visibility (idempotent) ───────
-- Observers build an observation in portions as a draft, then publish it
-- to the teacher. A draft must be hidden from the observed teacher until
-- published, so the SELECT policy is tightened: the teacher sees only
-- published observations; the observer always sees their own.
-- Default 'published' keeps every existing observation (and the generic
-- observation form) visible exactly as before.

alter table public.observations
  add column if not exists status text not null default 'published';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'observations_status_check'
  ) then
    alter table public.observations
      add constraint observations_status_check check (status in ('draft', 'published'));
  end if;
end $$;

create index if not exists observations_status_idx on public.observations(status);

-- Replace the SELECT policy so drafts never reach the observed teacher.
drop policy if exists "Users see own observations (as observer or observed)" on public.observations;
create policy "Users see own observations (as observer or observed)"
  on public.observations for select
  using (
    auth.uid() = observer_id
    or (auth.uid() = observed_id and status = 'published')
    or get_user_role() = 'admin'
  );
