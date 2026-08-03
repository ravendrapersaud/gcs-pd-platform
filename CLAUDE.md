# GCS PD Platform

Professional development & feedback platform for Grace Church School
(JK-12 independent school, NYC). Owner: Ravendra Persaud
(rpersaud@gcschool.org), Senior Director of Academic Systems. Built
collaboratively with the Dean of Faculty (Kim Chaloner) for pilot
feedback. See NEXT_STEPS.md for current status and backlog.

## Stack & deployment
- Next.js 14 App Router + TypeScript + Tailwind. Supabase (auth,
  Postgres w/ RLS, storage). Deployed on Vercel; pushes to `main`
  auto-deploy (webhook has occasionally missed pushes — if a commit
  doesn't appear in Vercel, `git commit --allow-empty` + push, or
  Create Deployment).
- Supabase project ref: `xhhxecoubvwqyqvctpdf`. Env in `.env.local`
  (never commit): Supabase URL/anon/service-role keys, Google API key +
  OAuth client id, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY` (empty until
  Resend is set up — email sending degrades gracefully).
- Production builds are STRICT: run `npx tsc --noEmit` before pushing.
  Cast Supabase joined rows via `as unknown as T`. No module-level
  constructors that throw on missing env (see lib/email.ts getResend).

## Conventions
- Dashboard pages: `app/dashboard/<section>/page.tsx` (REAL path
  segment, not a route group). Sidebar: `components/Sidebar.tsx`
  (role-gated sections + per-item minRole). Titles:
  `components/TopBar.tsx` route map.
- Brand: navy #003882 = Tailwind `navy-900` (ramp navy-50..950);
  Grace grey #C1C1C1; tertiary accents in tailwind.config.js. Fonts:
  Open Sans (`font-sans`), Asul (`font-display`). Per the school style
  guide: navy/white primary, tertiary colors only as highlights.
- Reusable CSS classes (globals.css): .card .btn-primary .btn-secondary
  .btn-ghost .input .label .badge .badge-navy/-green/-yellow/-red/-gray
  .tab .tab-active .tab-inactive.
- NO silent failures: surface every Supabase error in a red banner;
  updates use `.select()` to detect zero-row (RLS) results.
- Migrations: one idempotent file per change in `supabase/`
  (guard policies via pg_policies checks; `if not exists` everywhere).
  schema.sql is the fresh-install base; migration_*.sql are increments.

## Domain model (key points)
- profiles.role: staff | supervisor | admin (access level).
  profiles.employee_type: faculty | staff (job type — drives PD fund
  year: staff resets per `staff_fund_year_start` setting (July 1),
  faculty per `faculty_fund_year_start` (late Aug)). pd_allotment:
  per-person override, null = default.
- supervisor_assignments: staff_id ↔ supervisor_id, is_primary.
  Supervisors see/approve their reports' funding requests.
- app_settings (key/value): default_pd_allotment, staff/faculty fund
  year starts, pd_hours_target, funding_admin_threshold,
  allow_over_balance_requests, resource_moderation,
  workspace_creation_policy. Parsed by lib/funds.ts + lib/appSettings.ts
  (pure modules; pages fetch rows and pass in).
- taxonomy_terms: admin-managed audience/subject/theme tags with
  is_active + sort_order; lib/taxonomyDb.ts termsFor() falls back to
  lib/taxonomy.ts constants. Retiring/renaming affects new tagging only.
- Auth: Google OAuth (gcschool.org only — enforced by Google 'Internal'
  consent + hd hint + server-side domain check in dashboard layout) +
  email/password for the 5 seeded test users (Password123!). OAuth must
  redirect through /api/auth/callback (else double-login bug returns).
  Auto-created profiles get needs_setup=true.

## Gotchas learned the hard way
- Seeded auth.users need instance_id = all-zeros UUID + an
  auth.identities row or hosted Supabase hides them / login fails.
- Supabase SQL editor wraps a script in one transaction: new enum
  values can't be used in the same run (split schema/seed).
- Drive picker uses narrow drive.file scope → list view (thumbnails
  can't render under that scope; do not "fix" by widening scope).
- The staff roster CSV export columns exactly match the import format
  (round-trips). employee_type column matters for fund math.

## Test accounts (password Password123!)
rpersaud@ (ADMIN, owner — also Google SSO), kchaloner@ (admin, Dean of
Faculty — also Google SSO), kim@ (supervisor, HS head), alex@ (staff,
IT), sarah@ (staff, HS English). NOTE: seed.sql creates the owner row as
`ravendra@gcschool.org` (supervisor), but in production that row
(`aa000000-…-0001`) was renamed to rpersaud@ and promoted to admin — so
`ravendra@` is NOT a working login. A fresh install from seed.sql needs
that rename + promotion applied by hand.
