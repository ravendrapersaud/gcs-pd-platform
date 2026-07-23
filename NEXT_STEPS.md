# GCS PD Platform — Pickup Notes

_Last updated: July 22, 2026_

## Where things stand

The platform is **live on Vercel** and working: login, dashboards, resource
library, workspaces, spotlights (saving, not yet emailing), goals, PD log
with the $3,100 annual fund tracker, PD calendar, staff roster with
filters/export, CSV import. Production database is fully migrated
(pending the one item in Step 0 below if not yet done).

Test accounts (all password `Password123!`):

| Person | Email | Role |
|---|---|---|
| Ravendra Persaud | ravendra@gcschool.org | Supervisor (Sr. Dir. Academic Systems) |
| Kim Chaloner | kchaloner@gcschool.org | Supervisor (Dean of Faculty) |
| Kim Lee | kim@gcschool.org | Supervisor (HS Division Head) |
| Alex Kim | alex@gcschool.org | Staff (IT Technician) |
| Sarah Chen | sarah@gcschool.org | Staff (HS English Teacher) |

Key dashboards: **Vercel** (app hosting, deployments, env vars) ·
**Supabase** project `xhhxecoubvwqyqvctpdf` (database, auth, SQL editor) ·
**GitHub** `ravendrapersaud/gcs-pd-platform` (code; pushes auto-deploy).

---

## Step 0 — Only if not done yesterday (2 min)

Run `supabase/storage_setup.sql` in the Supabase SQL editor (creates the
`resource-covers` bucket). Verify with the ten-column check query — all
columns should be `true`.

## Step 1 — Share with Kim Chaloner (5 min)

Send her the Vercel URL + her login (`kchaloner@gcschool.org` /
`Password123!`). Suggest she tour: Dashboard, Resource Library, a
Workspace, Spotlights, PD Log (funding tab), Staff Roster. Note for her:
spotlights save but don't send email yet. Collect her feedback in a list —
each item becomes a change Claude can make, then `git push` redeploys
automatically.

## Step 2 — Google Cloud Console (~20 min)

This enables BOTH Google sign-in and the Drive picker in workspaces.

1. Go to **console.cloud.google.com** signed in with your school Google
   admin account. Create a project named `gcs-pd-platform`.
2. **APIs & Services → OAuth consent screen** → choose **Internal**
   (locks sign-in to gcschool.org Workspace accounts). App name
   "GCS PD Platform". Save.
3. **APIs & Services → Library** → enable **Google Picker API** and
   **Google Drive API**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → type **Web application**, name `gcs-pd-web`:
   - Authorized JavaScript origins:
     - `https://YOUR-APP.vercel.app`  (your real Vercel URL)
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://xhhxecoubvwqyqvctpdf.supabase.co/auth/v1/callback`
       (the SUPABASE callback — not your app's URL; most common mistake)
   - Save → copy the **Client ID** and **Client Secret**.
5. **Credentials → Create Credentials → API key** → copy it. Optional:
   restrict it to the Picker API + your two origins.

## Step 3 — Connect the pieces (~10 min)

1. **Supabase** → Authentication → Providers → **Google** → toggle ON →
   paste Client ID + Client Secret → Save.
   (The Client Secret goes ONLY here — never into Vercel env vars.)
2. **Supabase** → Authentication → URL Configuration → confirm Site URL is
   the real Vercel URL and `https://YOUR-APP.vercel.app/**` is in
   Redirect URLs.
3. **Vercel** → Settings → Environment Variables → add:
   - `NEXT_PUBLIC_GOOGLE_API_KEY` = the API key
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the OAuth Client ID
   Also confirm `NEXT_PUBLIC_APP_URL` = the real Vercel URL.
   Then **Redeploy** (env changes require a rebuild). Paste values
   carefully — value only, no `KEY=` prefix (this bit us twice).
4. **Local**: add the same two lines to `.env.local`, restart `npm run dev`.

## Step 4 — Test (5 min)

- On the live URL: **Sign in with Google** using your own
  rpersaud@gcschool.org — you should land on a dashboard and appear in
  Staff Roster flagged "Needs setup" (fill in your title there to clear it).
- In any workspace → Files → **Add from Google Drive** — the real picker
  should open (no longer the paste-a-link fallback).

## Later / backlog

- **Resend** (spotlight emails): create account at resend.com, verify the
  gcschool.org sending domain (DNS records), put the API key in
  `RESEND_API_KEY` on Vercel + `.env.local`, redeploy.
- **Real roster import**: export staff from Blackbaud → match the CSV
  template (Admin → Import CSV → Download Template) → import. Do this
  BEFORE opening Google sign-in to everyone, so people land on complete
  profiles.
- **Blackbaud API integration** (auto-sync instead of CSV): design is
  stubbed; build when ready.
- **Vercel/Supabase paid tiers** (~$45/mo total) before real production:
  Supabase Pro adds daily backups + no project pausing; Vercel Pro
  covers commercial use.
- Kim's feedback list → refinements.

## Handy commands

```bash
# project folder
cd "/Users/ravendrapersaud/Library/Application Support/Claude/local-agent-mode-sessions/2377161d-08d9-489f-acb4-991f5b9e7a4e/df08f296-e1fa-4d20-ac6a-effc3ddf77a2/local_670cc09b-3482-40d9-a3d9-546e8010b92d/outputs/gcs-pd-platform"

npm run dev                      # local server at localhost:3000
git add . && git commit -m "…" && git push   # save + auto-deploy
```
