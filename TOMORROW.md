# Tomorrow — Tuesday, August 4, 2026

_Written the evening of Aug 3. Background and history live in
**NEXT_STEPS.md**; this is just the plan._

School starts in a few weeks. The platform is built and secure; what's
left is **real data and real people**. Items are ordered so that if you
only get through two, they're the two that matter.

---

## 1. Make the dashboards show real numbers (15 min)

**Why first:** every PD hours figure currently reads **0**, correctly —
both seeded activities are dated 2024 and all views now filter to the
person's current fund year. If Kim opens the site tomorrow it looks
broken/empty. Fix this before anyone else sees it.

Two options:

- **Recommended: log a real activity.** Sign in as yourself, PD Log →
  add an activity dated in the last month with real hours. Then check
  the roster and your dashboard agree. This also exercises the logging
  flow, which has never been used with fresh data.
- **Or shift the seed dates.** Ask Claude to move Sarah's NCTE (Nov
  2024, 18h) and Alex's CompTIA (Oct 2024, 40h) into the current fund
  year. Faster for demo purposes, but it's fake data in production.

**Check afterwards:** your dashboard total, the roster's "PD Hrs"
column, and a supervisor's Team PD hours should all agree. They use one
definition now, so a mismatch means a real bug — tell Claude.

## 2. Real roster import from Blackbaud (1–2 hrs)

**The actual blocker for opening this to faculty.**

1. Export staff from Blackbaud.
2. Admin → Import CSV → **Download Template**, and match it exactly.
3. **Get `employee_type` right** — `faculty` vs `staff` decides which
   fund-year reset applies (staff July 1, faculty late Aug). Wrong
   values mean wrong fund math for the whole year.
4. Import, then **read the results** rather than assuming success. Rows
   are reported per-row, and any row requesting `supervisor`/`admin`
   from a non-admin importer is refused with a reason. You're an admin,
   so you won't hit that — but a partial import is possible.
5. Set up `supervisor_assignments` so approvals route correctly. Without
   a primary supervisor, a person's funding requests reach nobody.

**Do this before opening Google sign-in more widely**, so people land on
complete profiles instead of "Needs setup".

Start with one division if the full export feels risky — the roster
filters make it easy to verify a subset before importing the rest.

## 3. Send one real spotlight, end to end (10 min)

Resend is verified and live, so this now actually emails people. Nothing
has exercised the full path yet.

- Send a spotlight to someone real (or to yourself from another
  account). **Note it CCs the recipient's supervisors** — so a spotlight
  to Sarah emails Kim Chaloner.
- Then ask Claude to query `email_log`. Expect one row with
  `status = 'sent'` and a provider id. If it says `failed`, the error
  text is in that row.

This is the first thing that will populate `email_log`, and it confirms
the audit trail works rather than just existing.

## 4. Ask Kim Chaloner for her feedback (5 min)

She signed in **July 27** and created nothing — no spotlights, goals, or
requests. Either she just looked, or she hit friction. Her feedback list
was supposed to drive refinements and it's still empty.

Worth showing her tomorrow: the funding approval flow (now with decision
notes), and the roster once real people are in it.

---

## Decisions waiting on you

- **Should supervisors be able to *read* funding requests from people
  they don't supervise?** Right now yes — the SELECT policy is
  role-based, so Kim Lee can read every HS teacher's amounts and
  justifications, though she can't act on them. Claude can scope reads
  the same way approvals were scoped. For a $3,100 PD fund it's arguably
  fine; "Kim can read everyone's requests" is the kind of thing that
  surprises people.
- **Paid tiers (~$45/mo).** The free Supabase tier has **no backups**.
  Once real roster data and real funding decisions are in there, that's
  the exposure — not cost.

## If there's time left

- `getSession()` → `getUser()` hardening in the API routes (Supabase
  warns about this on every dev-server request).
- The Drive picker's multi-view sidebar (My Drive / Shared with me /
  Shared drives). Attempted and reverted today — shared drives need the
  `SUPPORT_DRIVES` builder feature and broke picker construction. Only
  worth it if departments actually keep materials in team drives.
- Delete the two seeded spotlights if you'd rather the pilot start from
  genuinely empty data.

## Reminders

- Real Chrome for anything touching Google sign-in or the Drive picker —
  Google blocks automated browsers.
- `npx tsc --noEmit` before every push; production builds are strict.
- Deploys are healthy (~45s) after the GitHub reconnect. If one seems
  stuck, check the deployment id changed rather than the bundle hash —
  the webpack hash doesn't change when only app code changes.
