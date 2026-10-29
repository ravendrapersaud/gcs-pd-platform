-- ── Peer observations (idempotent) ──────────────────────────────────
-- A quick, informal observation one teacher gives a colleague, using a
-- stripped-down form (no pre-meeting, ratings, or sign-off). Peer
-- observations are COLLEGIAL and PRIVATE: visible ONLY to the two teachers
-- involved — not to supervisors or admins — so people give candid feedback.
--
-- Stored in the existing observations table:
--   is_peer   = true
--   peer_data = jsonb { focus: text[], glow, suggestion, context }
--   twg_data  = null, framework_id = null, status = 'published'

alter table public.observations
  add column if not exists is_peer boolean not null default false;
alter table public.observations
  add column if not exists peer_data jsonb;

create index if not exists observations_is_peer_idx on public.observations(is_peer);

-- SELECT: observer always sees own; observed sees published; admins see all
-- NON-peer observations but never peer ones.
drop policy if exists "Users see own observations (as observer or observed)" on public.observations;
create policy "Users see own observations (as observer or observed)"
  on public.observations for select
  using (
    auth.uid() = observer_id
    or (auth.uid() = observed_id and status = 'published')
    or (get_user_role() = 'admin' and coalesce(is_peer, false) = false)
  );

-- INSERT: supervisors/admins still create formal observations (existing
-- policy "Supervisors and admins create observations"). Anyone may create a
-- PEER observation, but only one where they are the observer.
drop policy if exists "Anyone can create a peer observation" on public.observations;
create policy "Anyone can create a peer observation"
  on public.observations for insert
  with check (auth.uid() = observer_id and is_peer = true);

-- UPDATE: observer edits own; observed signs off a published formal one;
-- supervisors/admins manage NON-peer observations only.
drop policy if exists "Observers can update their observations; observed can sign off" on public.observations;
create policy "Observers can update their observations; observed can sign off"
  on public.observations for update
  using (
    auth.uid() = observer_id
    or auth.uid() = observed_id
    or (get_user_role() in ('supervisor', 'admin') and coalesce(is_peer, false) = false)
  );

-- DELETE: observer deletes own (including peer); admins delete NON-peer only.
drop policy if exists "Observers and admins delete observations" on public.observations;
create policy "Observers and admins delete observations"
  on public.observations for delete
  using (
    auth.uid() = observer_id
    or (get_user_role() = 'admin' and coalesce(is_peer, false) = false)
  );
