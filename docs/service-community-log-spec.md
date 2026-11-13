# Service & Community Log — Feature Spec (draft)

Owner: Ravendra Persaud · Reviewed with: Kim Chaloner (Dean of Faculty)
Status: **Reviewed & approved for v1 (2026-11-13) — ready to build.** All open
questions resolved; decisions recorded in §11.

---

## 1. Why

A person's contribution to the school is roughly **role + advising + community**.
The third leg — committees, affinity/cultural groups, focus groups, event help
(AV for the play, party planning), one-off volunteering — is real work that
currently leaves **no durable trace** on a profile.

Shout-outs don't fill this gap: they're **spontaneous, peer-initiated, episodic
recognition**. They can't be self-logged, carry no role or time frame, don't
aggregate into a yearly picture, and never surface in a check-in or review. The
quiet, sustained service (a year on the safety committee, running AV every spring)
is exactly what nobody shouts out.

**This feature makes community engagement a first-class portfolio dimension** —
a self-owned, optionally-endorsed record that can be reviewed and valued.

## 2. Guiding decisions

- ✅ **Purely qualitative.** No hours, no points, no time-commitment tag, no
  score. Quantifying service invites a leaderboard and feels like surveillance —
  the same reason we pulled the competency comparison tab. The value is the
  *record and the reflection*, not a number.
- ✅ **Self-report only.** The person records their own contributions; it is
  their portfolio. We considered a chair/supervisor **endorsement** step and
  **cut it from v1** — it felt heavy-handed for the warm, low-stakes feel we want.
  (Could be revisited later if a need emerges.)
- ✅ **Admins may log on a person's behalf.** People forget half of what they do;
  letting an admin add/edit an entry for someone is a kindness that helps surface
  and recognize that work. (See §4.)
- ✅ **Shared by default.** A new entry is visible to the person's supervisor(s)
  and designated admins unless the owner marks it private.
- ✅ **Formative, not evaluative.** It feeds conversations (check-ins / Growth
  log), it does not generate a rating.
- ✅ **Faculty and staff both.** Community service spans all employee types.

## 3. The core object — a service entry

One lightweight record per contribution. Mirrors the shape/UX of the PD Log and
Projects, so it reuses familiar patterns.

| Field | Type | Notes |
|---|---|---|
| `title` | text (required) | e.g. "DEI Committee", "AV for the Spring Musical", "New Family Welcome" |
| `service_type` | taxonomy term | committee · affinity/cultural group · focus group · event / production · coaching or club · one-off volunteer · other (admin-managed, see §6) |
| `role` | text / small enum | member · chair/lead · volunteer · organizer (free text allowed) |
| `timeframe` | enum | `ongoing` · `school_year` · `one_off` (with an optional single date) |
| `reflection` | text (optional) | what it was / what they contributed / what they took from it |
| `link` | url (optional) | a Drive doc, sign-up, program, photo album |
| `visibility` | enum | `shared` (owner + supervisor(s) + designated admins) · `private` (owner only) — **default `shared`** |
| `subject_id` | profile | whose contribution (the owner) |
| `created_by` | profile | who entered it — the owner, or an admin logging on their behalf |
| `created_at` / `updated_at` | timestamptz | |

**Explicitly NOT on the entry:** hours, a points value, a workload weight, a
rating — and, per the review, no endorsement/confirmation field either. (Per §2.)

## 4. Permissions (RLS)

Reuse the scoping we built for the 1:1 data so it's consistent and already
division-aware:

- **Read:** owner always; for `shared` entries also the owner's supervisor(s) and
  **designated school/division admins** (the same `is_checkin_admin` /
  `can_access_checkin` logic, or a shared generalization of it). `private` entries
  are owner-only.
- **Create / update / delete:** the owner **and designated admins** — admins may
  add or edit an entry on a person's behalf (§2), recorded via `created_by`. No
  endorsement step exists, so there is no separate confirm permission.
- No silent failures — surface Supabase errors in a red banner; updates use
  `.select()` to detect RLS zero-row results (house rule).

## 5. Portfolio surface

A new **"Service & Community"** section on the portfolio (name is ❓), year-scoped
like the others:

- Entries grouped by **type** (or by ongoing-vs-this-year), each showing role,
  timeframe, and the reflection on expand. An entry an admin logged on the
  person's behalf shows a quiet "added by ___" note.
- Owner (and designated admins) get **add / edit / remove**; other viewers get
  read-only per visibility.
- **Empty-state annual nudge** via `PortfolioPromptBlock` — "Log what you've
  contributed to the community this year" — owner-only, current-year-only, in
  keeping with the annual-ritual framing.
- Becomes a natural **check-in / Growth-log talking point** ("let's look at what
  you carried for the community this year").

## 6. Taxonomy (service types)

Admin-managed, like the existing tags. Two implementation options:
- Extend `taxonomy_terms` with a new `category = 'service_type'` (requires
  widening the category check constraint), **or**
- A small dedicated `service_types` table.
Recommendation: **extend `taxonomy_terms`** for consistency with how audience/
subject/theme tags are already managed in Admin → Settings.

Seed list (editable): Committee · Affinity / Cultural group · Focus group /
Task force · Event / Production · Coaching / Club · One-off volunteer ·
**Service learning** · **Trip / Chaperoning** · **Admissions help** · Other.

## 7. Relationship to existing features

- **Shout-outs** stay as-is (spontaneous recognition). *Optional nicety:* a
  shout-out may reference a service entry, so "thanks for doing AV" links to the
  AV record and enriches it. (Phase 2.)
- **Committees as Workspaces (phase 2 — confirmed wanted).** Standing committees
  are already modeled by Workspaces (manual membership + a manager = chair +
  posts/files), and Ravendra specifically wants real committee workspaces. We can
  mark certain workspaces as `committee`-type and surface **"Committees I serve
  on"** on the portfolio straight from `workspace_members` — almost no new data.
  The free-form log covers the one-offs; workspaces cover the standing bodies.
- **Competency evidence (optional, phase 2).** A "Community & Citizenship"
  framework could let a service entry be tagged as evidence, reusing the
  competency_evidence machinery — only if we want service to inform a competency
  picture.

## 8. Admin / reporting (phase 2) — *equity, not ranking*

A division/whole-school view framed strictly as **distribution of load**:
- Who is carrying a lot of committees/service; who has **nothing logged** (a
  gentle prompt to involve them), is service spread fairly across people and
  divisions.
- Reuses the `ReportCharts` pattern on the admin Reports page.
- **Never** "who did the most" or any count-based ranking of individuals.

## 9. Out of scope for v1

Hours / points / weights; **endorsement / confirmation** (cut in review);
approval or sign-off workflows; a public or external-facing directory; cross-year
analytics; committees-as-workspaces, shout-out linking, competency tagging, and
the admin equity view (all phase 2).

## 10. Build sketch & effort (for when we proceed)

Follows patterns already in the codebase, so it's a contained build:
1. **Migration** — `service_entries` table + RLS (reusing the check-in scoping
   helpers) + taxonomy `service_type` terms. One idempotent file.
2. **Types** — `ServiceEntry` in `lib/types.ts`.
3. **Portfolio API** — add `serviceEntries` to the portfolio payload.
4. **Portfolio section** — a `ServiceCommunity` component (add / edit / list,
   endorsement badge) + the empty-state prompt. Mirrors PD Log / FocusCompetencies.
5. **Admin taxonomy** — service types editable in Admin → Settings (reuses the
   taxonomy editor).

Rough size: comparable to the follow-ups + linked-docs work — a day-ish for a
solid v1, phases 2 items separately.

## 11. Decisions (resolved 2026-11-13, Ravendra)

1. **Section name:** ✅ **"Service & Community."**
2. **Endorsement:** ✅ **Cut — self-report only.** Felt heavy-handed for the feel.
3. **Default visibility:** ✅ **Shared with supervisor by default** (owner can mark
   an entry private).
4. **Taxonomy seed list:** ✅ §6 list is a good start, **plus service learning,
   trip/chaperoning, admissions help.**
5. **Phase 1 cut:** ✅ **v1 = the self-owned log only.** Committees-as-workspaces
   (wanted), shout-out linking, competency tagging, and the admin equity view are
   **phase 2.**
6. **Admins editing on a person's behalf:** ✅ **Allowed** — people forget what
   they do; an admin can log/edit to recognize it (tracked via `created_by`).
