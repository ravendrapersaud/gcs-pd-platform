# GCS PD Platform — Working Doc

_Last updated: August 3, 2026 (evening)_
_For tomorrow's concrete plan see **TOMORROW.md**._

**Production: https://gcs-pd-platform.vercel.app**

Key dashboards: **Vercel** (hosting, deploys, env vars) · **Supabase**
project `xhhxecoubvwqyqvctpdf` · **GitHub**
`ravendrapersaud/gcs-pd-platform` (pushes auto-deploy).

---

## Where things stand

Build-out is done. The platform is live, the database is fully migrated,
and **local, production, and the database are all in agreement** —
nothing uncommitted, nothing unapplied.

Deploys are healthy again (~45s). The webhook had missed pushes three
times; disconnecting and reconnecting GitHub in Vercel fixed it. Empty
"trigger deploy" commits are no longer needed.

The platform is waiting on **people and data**, not features.

## What shipped August 3

**Security (all live and verified in production):**

- **`/api/import-csv` auth bypass closed.** It creates auth users with
  the service-role key and had been accepting requests with **no bearer
  token** — a comment said "in dev without token header, we allow —
  production should enforce auth" and production never did. Now 401/403.
- **Funding approvals scoped to assigned supervisors** — route guard +
  RLS policy via `is_supervisor_of()`. Admins unrestricted.
- **Admin profile edits scoped** the same way.
- **Role escalation closed in both paths**: only admins can create
  supervisor/admin accounts, via CSV import or the new single-create.

**Verified by direct database test, not just the UI.** Kim Lee
(supervisor) attempting to approve Alex's request updated **0 rows**;
the same statement against Sarah, whom she does supervise, updated
**1 row**. Both wrapped in a rollback, so no data changed. Three
independent layers now block it: UI scoping (the approvals page only
loads direct reports), the route's 403, and RLS.

**Features:**

- **`email_log`** audit trail — append-only, admins read all. The
  spotlights route had been writing to this table before it existed, so
  those inserts were silently erroring; nothing was ever recorded.
- **Resend is live.** Test message accepted (id
  `5e65db06-e386-494b-833b-38a7d8c35e26`), which only happens for a
  verified domain. Spotlight emails will send.
- **Drive picker**: browsable folders with breadcrumbs, still list view
  and still the narrow `drive.file` scope.
- **Staff roster**: `employee_id` is now editable, and **+ Add Person**
  creates one login+profile without building a CSV.
- **PD hours unified** on each person's own fund year — see the gotcha
  below.
- **Funding decisions record why**: `decision_note` column, an optional
  note on approve/deny, the justification restored to the Decided tab,
  and the requester now sees who decided, when, and the note.

## Current state of the data

| table | rows | note |
|---|---|---|
| profiles | 6 | 5 seeded + Akbar (real CSV import) |
| funding_requests | **0** | test rows deleted after verification |
| email_log | 0 | will populate on the first real spotlight |
| pd_activities | 2 | **both dated 2024** — see gotcha |
| spotlights | 2 | seeded; none emailed |

**Admins (agreed):** Ravendra Persaud, Kim Chaloner, Akbar Ali Herndon.
**Supervisor:** Kim Lee. **Staff:** Alex Kim, Sarah Chen.

Supervisor assignments: Akbar → Ravendra · Ravendra → Alex ·
Kim Chaloner (primary) + Kim Lee (secondary) → Sarah.

Kim Lee is the **only non-admin supervisor**, so she is the only way to
test supervisor-scoped behaviour — admins bypass those checks entirely.

## Gotchas learned today

- **All PD hours now read 0, and that is correct.** Both seeded
  activities are dated 2024 (Sarah's NCTE convention Nov 2024, Alex's
  CompTIA Oct 2024) and every view now filters to the person's current
  fund year. Previously the personal dashboard showed all-time (18h for
  Sarah) while the team view showed 0 — the same metric computed three
  ways. See TOMORROW.md item 1.
- **Google blocks OAuth in the Claude browser** and other automated
  browsers (`disallowed_useragent`). Use real Chrome for anything
  touching Google sign-in or the Drive picker; use email/password for
  automated testing.
- **The Drive picker needed `http://localhost:3000` in Authorized
  JavaScript origins**, not redirect URIs. `origin_mismatch` means that
  list, every time.
- **`gcschool.org` resolves to internal AD DNS on the school network**
  (`172.17.x.x`, nameservers `gcs-dc01..04`). Public DNS checks need
  `dig @8.8.8.8` explicitly, or TXT/MX lookups come back empty.
- **`/api/funding` authenticates from cookies**, while
  `/api/import-csv` and `/api/admin/*` use bearer tokens. The
  `Authorization` header the approvals page sends to `/api/funding` is
  ignored. Not a hole, but it makes a token-based test return 401
  instead of 403.

## Known gaps / backlog

- **Real roster import from Blackbaud** — the mechanism is proven with
  one person; the export is the work. Do it before opening Google
  sign-in widely so people land on complete profiles.
- **Supervisors can still *read* every funding request** (SELECT policy
  is role-based, not assignment-based). They can't act on other
  people's, but Kim Lee can read every HS teacher's amounts and
  justifications. Decide whether that's acceptable.
- **`getSession()` vs `getUser()`** — Supabase warns that `getSession()`
  reads cookies without authenticating them, and several API routes use
  it for auth decisions. Legitimate hardening item.
- **Blackbaud API integration** (auto-sync instead of CSV) — stubbed.
- **Paid tiers (~$45/mo)** before real production: Supabase Pro (daily
  backups, no pausing) + Vercel Pro (commercial use). The free tier has
  **no backups**, which is the real risk once faculty depend on this.
- **Kim Chaloner's feedback** — she toured the site July 27 and created
  nothing. Ask what she saw.
- `EMAIL_FROM` is unset, so the from-address falls back to
  `noreply@notify.gcschool.org` (correct; the subdomain is verified).

## Handy commands

```bash
cd ~/Projects/gcs-pd-platform

npm run dev                                   # localhost:3000
npx tsc --noEmit                              # ALWAYS before pushing
git add . && git commit -m "…" && git push    # save + auto-deploy

# public DNS (the school network resolves gcschool.org internally)
dig @8.8.8.8 +short TXT resend._domainkey.notify.gcschool.org
```

## Test accounts (password `Password123!`)

`rpersaud@` (admin, also Google SSO) · `kchaloner@` (admin, also Google
SSO) · `kim@` (supervisor) · `alex@` (staff) · `sarah@` (staff,
faculty type) · `aali@` (admin, real account)

There is **no `ravendra@` account** — that seeded row was renamed to
`rpersaud@`. `seed.sql` still creates it under the old name, so a fresh
install needs the rename + admin promotion applied by hand.
