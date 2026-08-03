# GCS PD Platform — Pickup Notes

_Last updated: August 3, 2026_

## Where things stand

The platform is **live on Vercel** and the build-out phase is essentially
done. Everything through the old "Steps 0–4" checklist (storage bucket,
Google Cloud project, OAuth client + API key, Supabase Google provider,
env vars) is **complete and verified** — Google sign-in works and the
real Drive picker loads. No code has changed since July 23 (`cf82e07`).

Verified in the production database on Aug 3:

- All 22 tables migrated, **RLS enabled on every one**.
- `resource-covers` storage bucket exists (old Step 0 — done).
- Taxonomy live: 35 `taxonomy_terms`. Settings live: 8 `app_settings`
  rows (allotment 3100, faculty year start 08-25, staff 07-01, hours
  target 40, moderation off, workspace creation = supervisors).
- 10 real PD events, 8 resources, 1 framework (3 domains / 6 indicators).

**The platform is waiting on people and data, not on features.**

## What has and hasn't been exercised

Kim Chaloner **did tour it** — she signed in via Google on July 27. But
the database shows she created nothing: no spotlights, goals, or funding
requests beyond the original seed rows. Worth asking her directly whether
she just looked or hit friction somewhere.

Still at seed level / never exercised with real data:

- **`funding_requests` = 0 rows.** The supervisor approval flow — the most
  important workflow in the app — has never actually run. Test it before
  anyone else sees it.
- Only 5 profiles (the seed accounts). No real roster yet.
- `kim@` and `sarah@` have never been signed into.
- Spotlights save but **do not email** (`RESEND_API_KEY` is empty).

## Accounts (as they really are in the DB)

| Person | Email | Role | Sign-in |
|---|---|---|---|
| Ravendra Persaud | rpersaud@gcschool.org | **admin** | Google + password |
| Kim Chaloner | kchaloner@gcschool.org | **admin** | Google + password |
| Kim Lee | kim@gcschool.org | supervisor | password |
| Alex Kim | alex@gcschool.org | staff (IT) | password |
| Sarah Chen | sarah@gcschool.org | staff (HS English) | password |

Password for all test accounts: `Password123!`

Two corrections from the old notes: there is **no `ravendra@gcschool.org`
account** — that seeded row was renamed to `rpersaud@gcschool.org`
(profile id `aa000000-…-0001`), so the old login fails. And
`kchaloner@` currently holds **admin**, not supervisor.

> **Open decision:** Kim Chaloner has full admin (can change fund policy,
> taxonomy, everyone's allotments). Fine if deliberate; drop her to
> `supervisor` in Admin → Staff Roster if not.

**Production URL: https://gcs-pd-platform.vercel.app**

Key dashboards: **Vercel** (hosting, deployments, env vars) ·
**Supabase** project `xhhxecoubvwqyqvctpdf` · **GitHub**
`ravendrapersaud/gcs-pd-platform` (pushes auto-deploy).

---

## Next up, in priority order

### 1. Test the funding request → approval loop (15 min)

Sign in as `sarah@gcschool.org`, submit a PD funding request against the
$3,100 fund. Sign in as her primary supervisor and approve it. Confirm
the balance math, the approvals badge, and the team dashboard all update.
This path has zero production rows and is the thing most likely to fail
in front of the faculty.

### 2. Add the Google env vars to `.env.local` (2 min)

Local dev is missing both, so the Drive picker silently falls back to
paste-a-link on localhost (production is fine):

```
NEXT_PUBLIC_GOOGLE_API_KEY=AIza…
NEXT_PUBLIC_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
```

Copy from Google Cloud Console → Credentials, or from the Vercel env
vars. Restart `npm run dev` after.

### 3. Real roster import — do this before opening sign-in (1–2 hrs)

Export staff from Blackbaud → shape it to the CSV template (Admin →
Import CSV → Download Template) → import. **Get the `employee_type`
column right** (faculty vs staff drives which fund-year reset applies).
Then set up `supervisor_assignments` so approvals route correctly.

School starts in a few weeks, so this is the real deadline. Do it before
anyone else signs in with Google, so people land on complete profiles
rather than "Needs setup."

### 4. Resend, so spotlights actually send (~30 min + DNS wait)

Create an account at resend.com. Verify a **subdomain**
(e.g. `notify.gcschool.org`), not the root domain — keeps this app's
sending reputation separate from school Google Workspace mail and can't
disturb existing SPF/DKIM. Add Resend's DNS records, wait for the green
check, then set `RESEND_API_KEY` on Vercel **and** in `.env.local` and
redeploy. Tell Claude the verified domain so the from-address gets
updated; optionally have Claude add an `email_log` table for an in-app
send audit trail.

### 5. Paid tiers before real production (~$45/mo)

Supabase Pro (daily backups, no project pausing) + Vercel Pro
(commercial use). Worth doing before the whole faculty depends on it —
the free tier has no backups.

### Backlog

- Kim's feedback list → refinements (ask her what she saw on July 27).
- **Blackbaud API integration** (auto-sync instead of CSV) — design is
  stubbed; build when the CSV flow gets tedious.
- Consider Vercel → Settings → Git disconnect/reconnect: the deploy
  webhook has missed pushes twice. Workaround is
  `git commit --allow-empty` + push, or Create Deployment in Vercel.

## Handy commands

```bash
cd ~/Projects/gcs-pd-platform

npm run dev                                   # localhost:3000
npx tsc --noEmit                              # ALWAYS before pushing
git add . && git commit -m "…" && git push    # save + auto-deploy
```
