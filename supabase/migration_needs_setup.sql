-- ============================================================
-- GCS PD Platform — Migration: needs_setup flag on profiles
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Profiles auto-created by the Google sign-in fallback are marked
-- needs_setup = true so admins can find and complete them.
-- Imported/seeded profiles default to false.
-- ============================================================

alter table public.profiles
  add column if not exists needs_setup boolean not null default false;

create index if not exists profiles_needs_setup_idx
  on public.profiles(needs_setup) where needs_setup;
