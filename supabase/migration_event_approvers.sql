-- Split PD-calendar event rights into SUBMIT (open to the whole org) and APPROVE
-- (a curated pool). Anyone authenticated may submit an event — it lands in the
-- review queue as 'pending'. Approvers publish/manage events. Approval is granted
-- per person via profiles.can_approve_events; admins always qualify. Idempotent.

alter table public.profiles
  add column if not exists can_approve_events boolean not null default false;

-- May the current user approve/manage events? SECURITY DEFINER so policies can
-- read profiles without recursing through profiles' own RLS.
create or replace function public.user_can_approve_events()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.can_approve_events)
  );
$$;

-- SELECT: everyone sees published events; approvers also see the pending queue.
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='View published events or review queue'
  ) then
    drop policy "View published events or review queue" on public.pd_events;
  end if;
  create policy "View published events or review queue"
    on public.pd_events for select
    using (
      auth.uid() is not null
      and (coalesce(status, 'published') = 'published' or public.user_can_approve_events())
    );
end $$;

-- Retire the old combined write policy (supervisor/admin for all).
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='Supervisors and admins manage events'
  ) then
    drop policy "Supervisors and admins manage events" on public.pd_events;
  end if;
end $$;

-- INSERT: anyone authenticated may submit their own event, but a non-approver may
-- only create a 'pending' row. Approvers may create published events directly.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='Anyone can submit events'
  ) then
    create policy "Anyone can submit events"
      on public.pd_events for insert
      with check (
        auth.uid() is not null
        and created_by = auth.uid()
        and (status = 'pending' or public.user_can_approve_events())
      );
  end if;
end $$;

-- UPDATE / DELETE: approvers (and admins) manage the queue and existing events.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='Approvers update events'
  ) then
    create policy "Approvers update events"
      on public.pd_events for update
      using (public.user_can_approve_events())
      with check (public.user_can_approve_events());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pd_events'
      and policyname='Approvers delete events'
  ) then
    create policy "Approvers delete events"
      on public.pd_events for delete
      using (public.user_can_approve_events());
  end if;
end $$;
