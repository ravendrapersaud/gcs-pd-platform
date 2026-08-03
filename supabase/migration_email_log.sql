-- ── email_log: in-app audit trail for outbound mail (idempotent) ────
-- Records every send attempt from the app — sent / skipped (no API key) /
-- failed (provider error) — so delivery issues are diagnosable without
-- leaving the platform. Written best-effort by the server; a log write
-- failing never fails the underlying action.

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  email_type   text not null,                       -- e.g. 'spotlight'
  to_email     text not null,
  cc_emails    text[] not null default '{}',
  subject      text,
  status       text not null,                       -- 'sent' | 'skipped' | 'failed'
  provider_id  text,                                -- Resend message id, when sent
  error        text,                                -- provider error, when failed
  spotlight_id uuid references public.spotlights(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists email_log_created_at_idx on public.email_log(created_at desc);
create index if not exists email_log_spotlight_id_idx on public.email_log(spotlight_id);

alter table public.email_log enable row level security;

do $$
begin
  -- Admins can read the full log.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_log'
      and policyname = 'Admins read email log'
  ) then
    create policy "Admins read email log"
      on public.email_log for select
      to authenticated
      using (get_user_role() = 'admin');
  end if;

  -- Any authenticated user may insert a row for their own action
  -- (server-side path stamps created_by = auth.uid()). No update/delete
  -- policies: the log is append-only.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_log'
      and policyname = 'Users insert own email log rows'
  ) then
    create policy "Users insert own email log rows"
      on public.email_log for insert
      to authenticated
      with check (created_by = auth.uid());
  end if;
end
$$;
