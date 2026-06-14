# Field Mode & Offline Sync

Phase 22 adds a mobile-first **Field Mode** view and a client-side offline queue so reps do not lose visit notes, check-ins, or route progress when cell service drops.

## Route

- **Field Mode:** `/admin/facilities/field`
- Linked from Today's Outreach, Saved Routes, Route Detail, Finder, Route Builder, and the Facilities hub.

## What can be queued offline

| Action | Offline behavior |
|--------|------------------|
| Quick Log | Saved to local queue with activity fields; photos stored in IndexedDB |
| Photo Note | Photos + metadata queued; uploaded on sync |
| Route check-in | Timestamp + optional GPS queued |
| Complete / skip stop | Queued; may depend on a Quick Log item |
| AI Capture | Raw note saved as draft only (no AI analysis offline) |

## What requires internet

- AI Capture analysis and confirm
- Photo AI review (analyze/confirm step)
- Live route load from server
- Packet send automation
- Real-time notifications generation

## Storage

- **Queue metadata:** `localStorage` key `saintly_facility_offline_queue_v1`
- **Photo blobs:** IndexedDB `saintly_facility_offline_v1` / `photo_blobs`
- **User scope:** Queue items include `user_id`; switching accounts shows a warning and blocks sync for the wrong user.

Do not store patient PHI in offline drafts when avoidable. Facility outreach notes are acceptable for this workflow.

## Sync engine

File: `src/lib/crm/facility-offline-sync.ts`

1. Loads pending/failed items for the current user
2. Processes one at a time (respects `depends_on_local_id`)
3. Calls existing APIs:
   - `POST /api/facilities/[id]/quick-log`
   - Photo upload client + optional activity link
   - Route check-in / complete / skip endpoints
4. Marks items `synced` or `failed` with `last_error`
5. After 5 failed retries, posts to `/api/facilities/offline-sync/notify-failed` (deduped notification)

AI Capture drafts are **not** auto-synced; use **Analyze** on the pending card when online.

## Online detection

Hook: `useFacilityOnlineStatus()`

- Uses `navigator.onLine` and window online/offline events
- Optional ping: `GET /api/facilities/field/ping`
- When back online with pending items, Field Mode offers **Sync Now** and auto-syncs small queues (≤5 items)

## Known limitations

- Offline queue is per-browser/device, not backed up to the server
- Photo blobs may be lost if the user clears site data
- AI Capture offline saves raw text only; user must analyze when online
- Follow-up complete and packet mark-sent queue types exist but are not wired in all UI flows yet
- No service worker / full PWA in this phase (home-screen tip only)

## Manual test steps

1. Open `/admin/facilities/field` on a phone or narrow browser window.
2. Confirm online/offline status bar and pending count display.
3. With an active route for today, verify next stop card and **Directions** / **Check In** actions.
4. DevTools → Network → Offline:
   - Save a Quick Log → should queue and show toast
   - Check in to a stop → badge shows pending sync
   - Complete or skip a stop → queued
5. Go back online → **Sync Now** → items should clear from pending list.
6. Force a sync failure (e.g. invalid facility) → item shows **Failed** with Retry.
7. Delete a pending draft → confirm dialog → item removed.
8. AI Capture offline → raw draft saved; **Analyze** opens modal when online.
9. Photo Note offline with image → sync uploads photo when online.
10. Verify Today's Outreach Field Mode card and route detail **Field Mode** link.
11. Run `npm run build` — must pass.

## Files added/changed (reference)

- `src/lib/crm/facility-offline-queue.ts`
- `src/lib/crm/facility-offline-blob-store.ts`
- `src/lib/crm/facility-offline-sync.ts`
- `src/lib/crm/facility-offline-route-helpers.ts`
- `src/app/admin/facilities/field/page.tsx`
- `src/app/admin/facilities/_components/FacilityFieldModeView.tsx`
- `src/app/admin/facilities/_components/FacilityOfflineStatusBar.tsx`
- `src/app/admin/facilities/_components/FacilityPendingSyncPanel.tsx`
- `src/app/admin/facilities/_components/FacilityPendingSyncCard.tsx`
- Integrations in Quick Log, Photo Note, AI Capture, Route Detail, Outreach
