-- ============================================================
-- GCS PD Platform — configurable fund sources & cost categories
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- The fund-source and cost-category dropdowns are now admin-editable in
-- Settings → PD & Funding (stored as newline lists in app_settings:
-- pd_fund_sources, pd_cost_categories, pd_personal_source_label). To let
-- admins ADD their own "paid elsewhere" sources, we drop the fixed CHECK
-- constraint on funding_requests.fund_source.
--
-- The money logic is unchanged and stays in code: ONLY fund_source =
-- 'personal' draws from the allotment (drawsFromAllotment() in lib/funds.ts).
-- Every other value — built-in or admin-added — is off-allotment.
-- ============================================================

alter table public.funding_requests
  drop constraint if exists funding_requests_fund_source_check;

-- Keep the default and prevent nulls (the app always sends a value).
alter table public.funding_requests
  alter column fund_source set default 'personal';
