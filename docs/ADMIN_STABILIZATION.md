# Admin & compliance stabilization (pre–phone / AI receptionist)

Single reference for env expectations, smoke tests, and known fragility.  
**Does not replace** `AGENTS.md` or Supabase RLS policies in the database.

---

## 1. Environment variables (checklist)

Set in deployment (e.g. Vercel) and locally in `.env.local`. Verify before release.

| Variable | Required for | Notes |
|----------|----------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients, middleware, auth | Public URL of the project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + SSR cookie client, middleware | Publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin` (`src/lib/admin.ts`), `create-compliance-events`, `generate-onboarding-pdf`, and other server-only admin operations | **Service role** — never expose to the client |
| `NOTIFICATION_ENQUEUE_SECRET` | `POST /api/notifications/enqueue-annual-reminders` | Optional for app boot; route returns **503** if unset |

---

## 2. Protected surfaces (what middleware / RLS / code guard today)

| Surface | How it is protected | Notes |
|---------|---------------------|--------|
| **`/admin/*`** | Middleware: must be logged in + row in `staff_profiles` | Non-staff → `/unauthorized` |
| **Staff profiles** | RLS: user reads own row; app uses role in code (`isAdminOrHigher`, etc.) | Role checks are **application-level** for many actions |
| **Employee credentials** | RLS on `employee_credentials`; admin UI + audit trigger | `CredentialManager` uses session client |
| **Annual / compliance events** | `admin_compliance_events`; dashboard + employee page + `ComplianceEventManager` | Created via app and `/api/create-compliance-events` |
| **Survey / hire packet PDF** | Staff: `GET /admin/employees/[id]/employee-file` (session); **snapshot save** requires admin+ | “Download Survey Packet” when survey-ready |
| **Audit log** | Insert: staff (RLS); Select: **admin/super_admin** only (policy) | Dashboard “Recent Audit Activity” |
| **Notification outbox** | Insert: service role (enqueue); Select: **admin/super_admin**; process noop: session + admin+ | Dashboard queue + “Process Test Batch” |

---

## 3. Admin smoke-test checklist

Run as **manager**, then **admin** (and **super_admin** if you use it). Record pass/fail.

### Auth & staff access

- [ ] Unauthenticated visit to `/admin` → redirect to login with `next=` preserved.
- [ ] User **without** `staff_profiles` row → `/unauthorized` after login.
- [ ] Staff user → `/admin` loads command center.

### Dashboard & filters

- [ ] `/admin` KPIs and employee list load without server error.
- [ ] Status / alert / pipeline filters change URL and list as expected.
- [ ] `nq` notification queue filters persist when using employee filters / refresh (if using queue UI).

### Employee record & credentials

- [ ] Open an employee → sections load (no blank 500 page).
- [ ] **Manager:** credential upload / view paths you expect to allow still work.
- [ ] **Admin:** sensitive status change (if applicable) still gated; audit row appears for audited actions.

### Annual / compliance events

- [ ] Compliance event manager: save due dates / status without error.
- [ ] Dashboard annual indicators still align with a known test employee (spot-check one).

### Survey packet / PDF export

- [ ] For an employee marked **survey ready**: “Download Survey Packet” (or equivalent) returns a PDF (not 401/500).
- [ ] **Admin only:** snapshot save path on employee-file (if used) returns 403 for manager.

### Audit log

- [ ] **Admin/super_admin:** “Recent Audit Activity” shows rows after a known audited action.
- [ ] **Manager:** section **not** visible (and no reliance on audit SELECT for managers).

### Notification queue

- [ ] **Admin/super_admin:** queue section visible; totals and table load.
- [ ] **Optional:** `POST /api/notifications/enqueue-annual-reminders` with secret → rows enqueued (if events qualify).
- [ ] “Process Test Batch” → summary message + rows move **pending → sent** (noop); **failed** rows show red styling if you force a failure in dev.

### API / cron hygiene (staging)

- [ ] `NOTIFICATION_ENQUEUE_SECRET` set if you use scheduled enqueue.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is set where server admin routes run (see §1).

---

## 4. Obvious gaps / fragile areas (no redesign—awareness only)

1. **Some `app/api` routes use service role without session checks** (e.g. compliance event creation, onboarding PDF generation, applicant file upload). They depend on **URL secrecy**, deployment network rules, or caller trust—not on `getStaffProfile()`. Treat as **high priority** before exposing new public entry points (e.g. phone webhooks).
2. **Large admin surfaces** (e.g. monolithic employee page): regressions are easy; smoke tests above are **sampling**, not exhaustive.
3. **Role enforcement** is mixed: middleware guarantees “is staff,” not “is admin,” for most `/admin` routes—individual actions must keep checking `isAdminOrHigher` / `isManagerOrHigher`.

---

## 5. When is it “stable enough” to start the phone system?

Proceed when:

- This checklist has been run **once on staging** (or prod read-only where safe) with **no blockers**.
- **Env vars** are verified in the target deployment (including **`SUPABASE_SERVICE_ROLE_KEY`** for server-only operations).
- You have **explicitly accepted or scheduled** hardening of **unauthenticated service-role API routes** before any **public** phone or webhook traffic hits the app.

The admin/compliance **feature set** can be considered baseline-stable for a parallel phone track **once** smoke tests pass and API exposure is understood—not necessarily after every edge case is automated.
