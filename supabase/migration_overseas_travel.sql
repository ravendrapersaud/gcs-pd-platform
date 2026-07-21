-- ============================================================
-- GCS PD Platform — Migration: overseas travel flag on funding requests
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================

alter table public.funding_requests
  add column if not exists is_overseas_travel boolean not null default false;
