-- ── Data API grants (Supabase "auto-expose new tables" change, Oct 30 2026) ──
-- From Oct 30 2026 Supabase stops auto-granting Data API access to NEW tables
-- in `public`. This restores it for every current table and, via default
-- privileges, for future ones — so new tables, fresh installs, `supabase db
-- reset`, and preview branches keep working without a per-table grant.
-- RLS still governs row access; these are table-level grants only. Idempotent.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
