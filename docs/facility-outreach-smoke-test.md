# Facility Outreach — Smoke Test Checklist

Internal QA checklist for Phases 1–14 (field sales + intake). Run after migrations and before releasing to production reps.

**Prerequisites**

- Migrations applied through `20260612210000_facility_referral_intake_checklists.sql`
- Staff user with `sales_agent` role and staff user with `manager`/`admin` role
- Optional: `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `MAPBOX_ACCESS_TOKEN` for full feature coverage

---

## 1. Facility Finder near me

- [ ] Log in as sales rep → open **Today's Outreach** or **Find Near Me**
- [ ] Allow location → results load with distance labels
- [ ] Tap **Directions**, **Call**, **Quick Log** on a result
- [ ] Add facility to route → route count updates

## 2. Discover Google Places

- [ ] Open **Discover** → search a city + facility type
- [ ] Portal results and Google results appear (or clear message if Google key missing)
- [ ] External result shows match status (already in portal / possible match / not in portal)

## 3. Quick Add Google facility

- [ ] From Discover, **Quick Add** an external place
- [ ] Facility appears in portal; detail page opens
- [ ] Duplicate add shows existing facility (no duplicate row)

## 4. Add to Route

- [ ] From Finder/Discover/Outreach, add stops to route
- [ ] **Route Builder** shows stop count
- [ ] External/Google stop shows “Quick Add first” or equivalent before portal actions

## 5. Route Builder

- [ ] Reorder stops, open directions link
- [ ] Enrich/route map loads (or graceful message if Mapbox missing)
- [ ] Quick Log from route stop saves one activity

## 6. Quick Log

- [ ] Save visit with outcome, notes, follow-up date
- [ ] Facility `last_visit_at` updates
- [ ] Only **one** activity row created per save
- [ ] Post-save actions (referral lead, follow-up) optional and deduped

## 7. AI Capture

- [ ] Paste visit notes → analyze returns draft (or `ai_not_configured` + Quick Log fallback)
- [ ] Confirm saves **one** activity with parsed fields
- [ ] Referral detection pre-fills referral modal when applicable

## 8. Photo Note

- [ ] Upload photo → attaches to activity/facility
- [ ] AI classify works with OpenAI key; upload still works without AI
- [ ] Signed file URL loads for recent photo only (not bulk)

## 9. Follow-Up Task

- [ ] Create task from facility detail or outreach
- [ ] Task appears on **Follow-Ups** (rep sees own tasks only)
- [ ] Complete / snooze / reschedule — no duplicate tasks on repeat create

## 10. Referral Lead

- [ ] **New Referral from Facility** creates CRM lead with `source: facility_outreach`
- [ ] Attribution fields set (`referring_facility_id`, rep, activity)
- [ ] Duplicate patient warning; force create blocked without confirm
- [ ] Intake checklist + CRM intake tasks bootstrap once (no duplicates on refresh)

## 11. Intake Pipeline

- [ ] **Facility Referrals** shows facility-sourced leads
- [ ] Manager: assign intake owner, toggle checklist
- [ ] Sales rep: sees own produced referrals; no intake assign UI
- [ ] Status update saves note to lead activity

## 12. Convert / lost referral

- [ ] Convert lead → patient retains `referring_facility_id`
- [ ] Lost requires reason; optional source follow-up task for rep
- [ ] Facility `last_referral_at` updated on new referral

## 13. Analytics (manager only)

- [ ] Sales rep **cannot** open Outreach Analytics (redirect/forbidden)
- [ ] Manager sees summary, pipeline health, top sources
- [ ] CSV export works for manager

## 14. Permission checks

- [ ] Unauthenticated API calls return 403
- [ ] Sales rep cannot access `/admin/facilities?hub=0` admin table (redirect to outreach)
- [ ] Manager can access hub, list, analytics, referrals intake assign
- [ ] No service role or API keys in client bundle/network responses

## 15. Missing API key fallback

- [ ] Discover without Google key: portal search still works; clear warning for external
- [ ] AI Capture without OpenAI: error message + Quick Log suggested
- [ ] Photo upload without AI: manual confirm still works
- [ ] No hard crashes on any of the above

---

## Regression spot-checks

- [ ] CRM lead detail shows facility referral panel for facility-sourced leads
- [ ] Facility detail attribution + referral pipeline link
- [ ] Today's Outreach pipeline badges on warm sources
- [ ] Existing admin CRM leads list and patient conversion unchanged

**Sign-off:** _______________ **Date:** _______________
