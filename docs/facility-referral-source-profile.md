# Referral Source Profile (Phase 23)

Each facility can have a **Referral Source Profile** that summarizes relationship status, referral process, contacts, and next best action.

## Location

- **Facility detail:** Referral Source Profile panel (near top of page)
- **API:** `/api/facilities/[facilityId]/referral-profile`

## Data

- Table: `facility_referral_profiles` (one row per facility)
- Contact flags on `facility_contacts`: `is_best_contact`, `is_gatekeeper`, `is_referral_contact`

## Features

| Feature | Behavior |
|---------|----------|
| Manual edit | Edit Referral Profile modal — all core fields |
| AI refresh | Analyzes last 180 days of history; user confirms fields before save |
| Next best action | Deterministic rules + saved profile field |
| Quick Log prompt | When referral process captured, offers profile update |
| Outreach hints | Best contact, preferred method, next action on facility cards |
| Field Mode | "Before you walk in" bullets on next stop |
| Analytics | Referral Source Intelligence section with completeness metrics |
| Notifications | Missing process, profile needs update, next action due |

## AI

- Endpoint: `POST .../referral-profile/ai-refresh`
- Requires `OPENAI_API_KEY`; shows friendly message if not configured
- Never overwrites profile without user confirmation

## Next best action rules (deterministic)

1. Packet requested but not sent → Send packet
2. Packet sent, not confirmed → Confirm received
3. Open referral leads → Check intake status
4. Campaign step due → Complete step
5. Warm/hot, no follow-up → Schedule follow-up
6. High priority, no visit 14+ days → Drop-in visit
7. No activity ever → First introduction
8. Warm/hot, no referral process → Capture referral process

## Manual test steps

1. Open a facility detail page — profile panel loads (creates row if missing).
2. Edit profile manually — save and verify persistence.
3. Run AI refresh — review side-by-side, accept selected fields only.
4. Quick Log with referral process note — confirm profile update prompt.
5. Mark contact as Best / Decision maker / Gatekeeper / Referral.
6. Check Today's Outreach card hints.
7. Open Field Mode with active route — "Before you walk in" on next stop.
8. Open Outreach Analytics — Referral Source Intelligence section.
9. Warm facility without referral process — notification after daily alert sync.

## Known limitations

- AI contact matching is by name substring only
- Profile hints on outreach load for dashboard cards only (not all list views)
- Follow-up task source `referral_profile` is not filterable in UI yet
