# Saintly iOS (Expo) — push notifications, CallKit, TestFlight

This document matches the implementation in `mobile/` and the server routes under `src/lib/push/` and `src/app/api/workspace/mobile/push/register/`.

## Feature status (code vs portal setup)

| Capability | Status |
|------------|--------|
| **SMS push (FCM)** | **Implemented** in app + server. Requires **Firebase** (APNs on iOS) + server `FIREBASE_SERVICE_ACCOUNT_JSON` + migration `user_push_devices` applied. |
| **Incoming call native ringing (CallKit / PushKit)** | **Partially implemented** in the mobile app (`@twilio/voice-react-native-sdk` + `initializePushRegistry`). **Not complete** until **Apple** (VoIP / push entitlements), **Firebase** (if using FCM for anything else), and **Twilio VoIP Push Credential** are configured and linked to your Voice app. Until then, **FCM “Incoming call”** alerts are a fallback; **browser + PSTN** ringing is unchanged. |

## Phase 1 — Audit summary (stack)

| Item | Finding |
|------|---------|
| Wrapper | **Expo SDK 54** + **React Native** + **react-native-webview** (WKWebView on iOS). Not Capacitor. |
| Firebase | `@react-native-firebase/app` and `@react-native-firebase/messaging` (FCM token on device; APNs delivers alerts via Firebase). |
| Incoming calls | `@twilio/voice-react-native-sdk` with `initializePushRegistry()` (PushKit) + `register(accessToken)` for native CallKit incoming UI when Twilio VoIP push is configured. |
| Web parity | Twilio **browser** Voice SDK unchanged; web posts the same access token to the native shell so both can register. |
| Server | SMS: `POST` Twilio webhooks → `applyInboundTwilioSms` → FCM fan-out. Calls: `POST /api/twilio/voice/inbound-ring` after `incoming_call_alerts` insert → FCM fan-out. |

## Apple Developer (required)

1. **Identifiers** → App ID `com.saintlyhomehealth.app`
   - **Push Notifications** capability enabled.
   - For **VoIP** / Twilio: create a **VoIP Services** certificate **or** use APNs Auth Key (recommended) and upload to Twilio as a **Push Credential** (VoIP).
2. **Keys** (recommended): APNs **Auth Key** (`.p8`) — one key can sign both development and production; upload to **Firebase Console** (iOS app) → Cloud Messaging → APNs, and separately to **Twilio** Console → Voice → Push Credentials (VoIP).
3. **Xcode / EAS**: After `expo prebuild`, open the iOS project and confirm **Signing & Capabilities**:
   - Push Notifications
   - Background Modes: **Audio**, **Remote notifications**, **Voice over IP**

`mobile/app.config.ts` sets `UIBackgroundModes` in `infoPlist`; EAS/ Xcode must still apply matching capabilities.

## Firebase (required for FCM server send)

1. Firebase project linked to the same iOS bundle id (`GoogleService-Info.plist` in `mobile/`).
2. Enable **Firebase Cloud Messaging API** for the project.
3. Create a **service account** with permission to send FCM; download JSON.
4. Production server: set **`FIREBASE_SERVICE_ACCOUNT_JSON`** to the **full JSON string** of that service account (escape safely in your host’s secret store).

## Twilio (required for native CallKit ringing)

1. **Programmable Voice** → **Push Credentials** → add **VoIP** credential (from Apple APNs key / VoIP cert).
2. Associate that Push Credential with Twilio Voice **TwiML App** / API key setup used by `/api/softphone/token` (per Twilio Voice docs for your account layout).
3. Inbound still uses `TWILIO_VOICE_INBOUND_STAFF_USER_IDS` and `resolveInboundBrowserStaffUserIdsAsync` — same identities as browser softphone.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Next.js server (Vercel / host) | Firebase Admin → FCM send |
| `SAINTLY_PUSH_SMS_DISABLED` | Server (optional) | Set to `1` to disable SMS push fan-out |
| `SAINTLY_PUSH_CALL_DISABLED` | Server (optional) | Set to `1` to disable inbound-call FCM fan-out |

Existing Twilio env vars unchanged (`TWILIO_*`, `TWILIO_VOICE_INBOUND_STAFF_USER_IDS`, etc.).

## Test checklist

### Local / dev client (physical device)

1. Replace `GoogleService-Info.plist` with real Firebase file; `npm run prebuild:clean` then `cd mobile && npx expo run:ios --device`.
2. Sign in on the keypad; confirm `POST /api/workspace/mobile/push/register` succeeds (device row in `user_push_devices`).
3. Send a test SMS to your Twilio number; staff should get a **New SMS** notification; tap opens the inbox thread path.

### Foreground / background / locked / killed

| Scenario | SMS (FCM) | Call (FCM alert + CallKit) |
|----------|-----------|----------------------------|
| App foreground | Data-only handling does not navigate; user stays on current screen (see `HomeScreen` — navigation uses notification **tap** handlers only) | CallKit if VoIP + native registered; FCM alert may still appear per OS |
| Background | Notification banner; tap opens app + deep link | Same |
| Locked | Same | CallKit full-screen |
| Process killed | **Notification** via FCM; tap opens URL | **CallKit** requires VoIP push + Twilio native registration; FCM alert is fallback when Twilio VoIP not configured |

### TestFlight

1. EAS `production` profile (store distribution); install from TestFlight.
2. Repeat sign-in and SMS test; confirm pushes on production APNs (Firebase + Apple prod certs).
3. **CallKit**: Verify Twilio VoIP credential is **production**; place inbound PSTN call to your Twilio number.

## What remains if CallKit does not ring

- **FCM fallback** is always sent: “Incoming call” with `open_path` → `/workspace/phone/keypad` so staff can still open the app.
- **Root cause** is usually missing Twilio **VoIP Push Credential** or APNs not uploaded to Firebase for the **production** build.

## Database

- Migration: `supabase/migrations/20260427120000_user_push_devices.sql` — table `user_push_devices`.
