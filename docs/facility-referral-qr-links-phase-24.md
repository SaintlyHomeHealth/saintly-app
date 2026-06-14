# Phase 24 — Referral QR & Trackable Links (Revised)

**Goal:** Make it easy for referral partners and reps to send patients to Saintly **without printing a unique QR code for every facility.**

Printed materials use **one universal QR** (or a small set of rep/campaign QRs). Facility-specific codes are **optional** and primarily **digital** (phone screen, email/fax packet links).

---

## Design principle

| Layer | Purpose | Printing required? |
|-------|---------|------------------|
| **1. Universal** | Postcards, swag, flyers, general packets, business cards | **One QR for all** |
| **2. Rep / campaign** | Track which rep or material batch produced referrals | **Small batch set** (not per facility) |
| **3. Facility-specific** | High-value offices, in-person “scan on my phone” | **Optional** — digital-first |
| **4. Packet digital links** | Email/fax from portal | **Never printed** — auto-generated |

**Do not block referral creation** if facility matching fails. Always create the lead; flag for review when needed.

---

## Public routes

### 1. Universal printed referral (primary)

```
GET /refer
GET /refer?src=printed_materials
```

Single QR code for all general Saintly printed materials:

- Postcards, swag bags, flyers, referral packets, business cards, leave-behinds

**Form fields (required unless noted):**

- Referring office / facility name
- Referring contact name (optional)
- Contact phone and/or email
- Patient / prospect: name, phone, DOB (optional), service needed
- Notes (optional)

**On submit:**

1. Create CRM lead immediately (never fail closed on matching).
2. Set `referral_source_type` = `universal_printed_qr` (or `printed_materials` from query).
3. Run **facility match** on typed office name + phone + email domain + city/address + contact name (see Matching).
4. If high confidence → attach `referring_facility_id` (+ contact if matched).
5. If low/no confidence → leave facility unattributed; set flag **`needs_referral_source_review`**; queue for admin review.

### 2. Rep / campaign tracking tokens (printed batches)

Short, human-readable slugs — **not** facility-specific.

```
GET /refer/t/[slug]
```

Examples:

- `/refer/t/kofi-card` — Kofi’s business cards
- `/refer/t/gilbert-podiatry` — Gilbert podiatry postcard batch
- `/refer/t/wound-care-postcard`
- `/refer/t/assisted-living-campaign`
- `/refer/t/east-valley-outreach`

**Token record** (`referral_link_tokens` or equivalent) stores:

- `slug` (unique)
- `token_type`: `campaign` | `rep_material` | `universal` | `facility` | `packet`
- `sales_rep_id` (optional)
- `campaign_id` (optional — links to `facility_campaigns` if applicable)
- `material_type` (e.g. `postcard`, `swag_bag`, `business_card`, `flyer`)
- `label` (admin display name)
- `is_active`, `expires_at` (optional)

Form: same as universal (including referring facility fields for attribution enrichment).

Attribution on submit:

- Apply rep/campaign/material from token **first**.
- Still run facility match from form fields; merge with token context.

### 3. Facility-specific (optional)

```
GET /refer/f/[token]
```

- Long opaque token or short slug per facility (admin-generated).
- **Not required** for the system to work.
- Use cases: top producer, facility-requested link, rep showing QR on phone, packet one-off.

Pre-fill referring facility on form when token resolves; user can still edit if wrong.

### 4. Packet / digital-only links

Generated when sending packet email/fax from admin portal — **not** for mass printing.

```
GET /refer/p/[token]
```

Token binds:

- `facility_id`, `facility_contact_id` (optional)
- `packet_request_id`, `packet_material_id` (optional)
- `sales_rep_id`, `campaign_id` (optional)

Email/fax body includes:

> Submit referrals securely here: [trackable link]

Reuse existing packet delivery pipeline (`facility-packet-delivery`, `facility-packet-email-send`, `facility-packet-fax-send`).

---

## Attribution priority (on form submit)

Apply in order; **never discard** lower-priority data — store full context in `referral_attribution_json`.

1. **Exact token** — facility, contact, campaign, packet, rep from `/refer/f/`, `/refer/p/`, or rich `/refer/t/` token
2. **Form-entered facility** — matched to existing `facilities` row (confidence ≥ threshold)
3. **Rep/campaign generic token** — from `/refer/t/[slug]` without facility
4. **Universal / unmatched** — `universal_printed_qr` or `unmatched_printed_qr`; flag for review

---

## Facility matching (post-submit)

Server utility: `matchReferringFacilityFromPublicForm(input)`

**Signals (weighted):**

| Signal | Notes |
|--------|--------|
| Facility name (typed) | Fuzzy match vs `facilities.name`, normalizeFacilityName |
| Phone | Main phone or contact direct/mobile |
| Email domain | Contact or facility email domain |
| City / address | If collected on form |
| Contact name | Match `facility_contacts` at candidate facilities |
| Recent rep activity | Optional: facilities on rep’s active route / recent visits |

**Outcomes:**

- `matched` — auto-link facility (+ contact if found)
- `suggested` — link with `match_confidence` 0.5–0.79; optional auto-link per config
- `unmatched` — lead created; `needs_referral_source_review = true`

Reuse patterns from `facility-match.ts`, `facility-ai-capture` facility resolution, and referral profile best-contact data.

---

## Database (new / extended)

### `referral_link_tokens`

| Column | Purpose |
|--------|---------|
| id, slug/token | Public URL segment |
| token_type | universal \| campaign \| rep_material \| facility \| packet |
| facility_id, contact_id | Optional |
| sales_rep_id, campaign_id | Optional |
| packet_request_id, material_id | Optional |
| material_type, source_label | Tracking |
| is_active, expires_at | Admin control |
| metadata jsonb | QR campaign notes, print batch id |

### Leads (extend existing attribution columns)

Already have: `referring_facility_id`, `referring_facility_contact_id`, `referral_source_type`, `referral_attribution_json`, `produced_by_user_id`.

Add or use json fields for:

- `needs_referral_source_review` (boolean or status in json)
- `referral_link_token_id`
- `facility_match_confidence`
- `typed_referring_facility_name` (raw form input)

### Review queue

Filter on `/admin/facilities/referrals` (or dedicated tab):

- Source = `unmatched_printed_qr` or flag `needs_referral_source_review`
- Actions: link to facility, dismiss, create facility

Phase 24 minimum: filter + badge on existing referrals list. Dedicated review UI can follow in Phase 24b.

---

## Admin / field UI

### Show Referral QR (rep phone — no printing)

Add **Show Referral QR** from:

- Field Mode (`/admin/facilities/field`)
- Route stop / Route detail
- Facility detail
- Today’s Outreach facility card (optional)

**Behavior:**

- If facility known → facility-specific link `/refer/f/[token]` + QR modal
- If unknown → universal link `/refer` + QR modal

**Modal actions:**

- Show QR (large, scannable)
- Copy link
- Share / SMS (Web Share API when available)
- Create facility-specific link (if only universal existed)

Component: `FacilityReferralQrModal` — client-only QR render (e.g. `qrcode` npm package).

### Admin: token management (manager)

Page or section under Facilities → Referrals or Settings:

- Create/edit rep/campaign tokens (`/refer/t/...`)
- Generate facility token on demand
- Download **one** universal QR PNG/SVG for print shop
- List packet-generated links (read-only audit)

---

## Packet email/fax integration

In `facility-packet-email-send` / fax cover generation:

1. Mint or reuse `referral_link_tokens` row (`token_type = packet`, linked to packet request).
2. Append referral CTA with `/refer/p/[token]` URL.
3. Log in `facility_packet_delivery_attempts.metadata`.

No change to printed packet PDFs required for Phase 24 — digital channel only.

---

## Public form UX

- Mobile-first, minimal PHI on screen; HIPAA-safe copy
- Separate public layout from admin (no auth)
- Thank-you page with Saintly intake phone/fax fallback
- Rate limiting + basic bot protection on POST
- Do **not** expose internal facility IDs in URLs for universal/campaign links

Existing marketing page `/referrals` remains partner-facing info; **`/refer`** is the actionable submission form (can redirect or coexist).

---

## What we are NOT doing

- ❌ Requiring a unique printed QR per facility
- ❌ Blocking lead creation when facility match fails
- ❌ Replacing phone/fax referral intake
- ❌ Storing full medical records on public form

---

## Acceptance criteria (revised)

1. **One universal printed referral QR** works (`/refer`).
2. Universal submissions **always create leads**.
3. Universal form collects **referring facility + contact** + patient info.
4. System **attempts to match** typed facility to portal facilities.
5. **Unmatched** referrals are created with review flag (`unmatched_printed_qr` / needs review).
6. **Rep/campaign tokens** track material batches without facility-specific print runs.
7. **Facility-specific QR** is optional — not required for core workflow.
8. Rep can **Show Referral QR on phone** from Field Mode / facility / route.
9. **Packet emails/faxes** include facility-specific digital referral links.
10. Saintly does **not** need one printed QR per facility.

---

## Implementation order (suggested)

1. Migration: `referral_link_tokens` + lead review flags
2. Public routes: `/refer`, `/refer/t/[slug]`, POST submit API
3. Matching lib + lead creation
4. Universal QR asset + admin token CRUD
5. `FacilityReferralQrModal` + Field Mode / detail / route hooks
6. Packet email/fax link injection
7. `/refer/f/[token]`, `/refer/p/[token]`
8. Referrals admin: unmatched / needs-review filter

---

## Related existing code

| Area | Path |
|------|------|
| Facility referral leads | `src/lib/crm/facility-referral-lead.ts` |
| Lead attribution columns | `supabase/migrations/20260612200000_facility_referral_attribution.sql` |
| Referrals admin | `src/app/admin/facilities/referrals/` |
| Packet delivery | `src/lib/crm/facility-packet-delivery.ts` |
| Facility name match | `src/lib/crm/facility-match.ts` |
| Marketing referrals page | `src/app/referrals/` (info only today) |
| Field Mode | `src/app/admin/facilities/field/` |

---

## Manual test plan (post-implementation)

1. Scan universal QR → form → submit with known facility name → lead linked.
2. Submit with nonsense facility name → lead created, review flag set.
3. Scan `/refer/t/test-campaign` → lead has campaign/rep attribution.
4. Field Mode → Show Referral QR for stop → facility link scans correctly.
5. Send packet email → body contains `/refer/p/...` link → submit attributes facility + packet.
6. Verify existing admin referral pipeline, analytics, and notifications still work.
