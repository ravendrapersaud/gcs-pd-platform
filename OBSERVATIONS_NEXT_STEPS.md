# Teaching with Grace — Observation Tool

_Status & next steps, for Ravendra + Kim. Last updated: Oct 6, 2026._

## What it is

A classroom observation tool built into the PD platform. It's **framework-driven** —
it works for any observation framework, and **Teaching with Grace** is the default
(its four pillars plus optional discipline/division add-ons). The observer moves
through four steps:

1. **Set up** — pick the framework, length of visit (pop-in / short / full), the
   teacher, course, division, which pillars to focus on, discipline add-ons, and the
   pre-observation conversation.
2. **Live notes** — a running timer; type notes and tag them to pillars, or highlight
   just a portion of a note and tag that span. Colored legend for each pillar.
3. **Analysis** — per pillar: check off the look-fors you noticed, write strengths and
   growth/support, flag for follow-up. Your tagged notes surface as evidence.
4. **Share** — a teacher-facing summary you can copy, download (.md / .html), and
   **publish** (which emails the teacher).

## What works today

- The full four-step capture, span-level tagging, look-for checkboxes, discipline
  add-ons, and your-own-look-fors.
- **Drafts vs. Publish** — drafts are private to the observer; the teacher only sees an
  observation once it's published. Publishing emails the teacher.
- **Resume** a draft later; **delete** an observation (observer or admin).
- **Framework management** (create / edit / delete) under _Frameworks_.
- **Reporting** — an _Observations_ report (Reports page) with per-pillar columns, a
  combined "feedback by area" column, and CSV/XLSX export; filter by division,
  department, date.

## To finish going live (owner tasks)

1. **Run this migration in Supabase** (idempotent, safe): `supabase/migration_observation_delete.sql`
   (adds delete permission). The other observation migrations are already applied.
2. **Set `RESEND_API_KEY`** on Vercel (and `.env.local`) so publishing emails the
   teacher. Without it, publishing still works — the teacher just isn't emailed.
3. **Deploy** — pushing to `main` auto-deploys.

## Quick test checklist

- Create an observation → tag notes → check look-fors → **Save draft** → it appears in
  the **Drafts** tab.
- **Resume** the draft → **Publish** → the observed teacher sees it (and gets an email
  if Resend is configured).
- **Delete** a draft and a published observation.
- Run the **"Teaching with Grace Observations"** report and export CSV.

## Open decisions for Kim

- **Add-ons** (discipline/division look-fors) are a first draft for department chairs to
  refine — which to keep, edit, or add?
- **Framework content** — confirm the Teaching with Grace pillars and look-fors
  (v. 8.26.25) are current.
- **Who can observe** — currently supervisors and admins. Confirm.
- **No numeric rating** — we capture strengths / growth / follow-up flag instead of a
  1–4 score. Good, or do some rubrics need a score?

## Known dev follow-ups

- Continue the brighter/airier styling pass across the rest of the site (started).
- Remove the now-unreachable legacy "general observation" form.
- Add-ons are Teaching-with-Grace-specific; could be generalized to per-framework later.
- The report's fixed pillar columns only fill for Teaching with Grace observations;
  other frameworks use the "feedback by area" column.
