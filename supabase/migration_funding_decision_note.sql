-- ── Funding decisions: record WHY (idempotent) ───────────────────────
-- funding_requests tracked reviewed_by and reviewed_at but had nowhere to
-- store the reasoning, so a denial could never be explained after the
-- fact. For a shared PD fund that's the first question people ask, and an
-- approval trail without a rationale is hard to defend.
--
-- Nullable on purpose: existing decisions (and future ones where the
-- reviewer has nothing to add) simply have no note.
--
-- Safe to run multiple times.

alter table public.funding_requests
  add column if not exists decision_note text;

comment on column public.funding_requests.decision_note is
  'Optional reviewer rationale captured at approve/deny time. Visible to the requester.';

-- No RLS change needed: the existing SELECT policy already lets a person
-- read their own request rows (and supervisors/admins read them), so the
-- note follows the same visibility as the request itself.
