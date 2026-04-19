# App Store release checklist — Saintly Phone (iOS)

Use this with `mobile/` (Expo + EAS). Web deploy uses the Next.js app (`/` routes including `/privacy`, `/terms`, `/support`, `/security`).

## 1. App information (App Store Connect)

| Field | Draft / notes |
|-------|----------------|
| **App name** | Saintly Phone |
| **Subtitle** (30 chars max) | Candidates: `Care calls & staff SMS`, `Home health phone hub`, `Staff calls & messages` — pick one after marketing review |
| **Primary category** | Business or Medical (verify with Apple’s definitions; “Business” is typical for internal staff tools) |
| **Secondary category** | Productivity or Medical (optional) |

## 2. Description (draft)

Saintly Phone is the mobile app for authorized Saintly Home Health staff. Sign in with your organization account to access the Saintly workspace phone: place and receive calls, send and receive SMS, listen to voicemail, and work leads and follow-ups. Push notifications alert you to new messages, missed calls, voicemails, and new leads based on your role and routing rules.

**Note:** This app is not for the general public; access requires valid business credentials issued by Saintly Home Health.

*(Adjust wording to match final marketing voice.)*

## 3. Keywords (100 characters max, comma-separated — draft)

```
home health,staff,calling,SMS,voicemail,CRM,lead,care coordination,Saintly
```

*(Remove duplicates and spaces after commas as required by App Store Connect.)*

## 4. URLs (set in App Store Connect after web deploy)

| Purpose | URL (production) |
|---------|------------------|
| **Support** | `https://www.saintlyhomehealth.com/support` — **verify** `NEXT_PUBLIC_SITE_URL` / deployed host; if the app API uses `https://www.appsaintlyhomehealth.com`, confirm which domain serves the marketing/legal pages in production and use that canonical URL in Connect. |
| **Privacy Policy** | `https://www.saintlyhomehealth.com/privacy` (same host verification as above) |
| **Marketing** | Optional: `https://www.saintlyhomehealth.com` |

**Rule:** Support and Privacy URLs must load over HTTPS with no certificate errors.

## 5. App Privacy questionnaire (draft — verify against your build)

Answer in App Store Connect using Apple’s categories. Below is a **conservative first pass** from code and integrations; **verify before submission**.

| Data type | Collected? | Linked to user? | Purpose | Tracking? |
|-----------|------------|-------------------|---------|-----------|
| **Name** | Yes (staff profile / CRM) | Yes | App functionality, account management | No |
| **Phone number** | Yes (calls/SMS/lead data) | Yes | App functionality, communications | No |
| **Email address** | Yes (account) | Yes | Account, support | No |
| **Audio** | Yes (calls, voicemail playback) | Yes | App functionality | No |
| **SMS / MMS** | Yes | Yes | App functionality | No |
| **Customer support** | Possible (support contact) | Optional | Support | No |
| **Device ID** | Yes (FCM token, device registration) | Yes | Push notifications, security | No |
| **Coarse / precise location** | **Verify** — `expo-location` plugin present; usage depends on features invoked | If collected | **Verify** — only if product uses location in release | No (unless you use IDFA; **verify**) |
| **Diagnostics** | Possible (crash logs via platform / Firebase as configured) | Often not linked | Analytics / stability | No |

**Integrations to double-check:** Supabase (auth, data), Twilio (voice/SMS), Firebase Cloud Messaging / Firebase App (push), `@twilio/voice-react-native-sdk` (calls). List any other SDKs before submitting.

**If uncertain:** Mark “verify before submission” and walk through Settings → Privacy on a TestFlight build.

## 6. Screenshot checklist (App Store)

Capture from **production/TestFlight** build where possible:

- [ ] Keypad / dial (signed in)
- [ ] Inbox or thread list
- [ ] Active call or call controls (if allowed by PHI policy — use fake numbers)
- [ ] Voicemail list or player (sanitized)
- [ ] Optional: notification permission / CallKit incoming (staging)

**6.5" and 6.7" iPhone** are typically required; confirm current Apple requirements in App Store Connect.

## 7. Release notes (template)

```
What’s new in 1.0.x:

- Saintly Phone for staff: calls, SMS, voicemail, and lead alerts
- Push notifications for inbound messages, missed calls, voicemails, and new leads (by role)
- Performance and reliability improvements
```

## 8. Review notes (template — paste into App Store Connect)

```
Saintly Phone is an internal staff communications app for Saintly Home Health LLC. It is not intended for the general public.

Test account:
- We can provide a demo staff login on request, or reviewers may use credentials supplied in the “App Review Information” section (add a dedicated reviewer account if your policy allows).

Behavior:
- Users sign in with email/password (Supabase) and access the same phone workspace as the web app inside an embedded WebView, with native Twilio Voice registration for incoming calls where configured.
- Push notifications route users to workspace paths for SMS (inbox thread), missed calls, voicemail, and new leads. Managers may open admin CRM lead detail URLs; other roles open workspace phone pages (see middleware in the web app).

Twilio / telephony:
- Real PSTN and SMS may incur charges; we use test credentials only if provided to Apple.

If you need a video or Loom of the flow, contact: Paul@saintlyhomehealth.com
```

## 9. What requires a **native rebuild** (Expo / EAS)

Changing any of the following requires a new binary (not OTA alone):

- App icon (`mobile/assets/icon.png`, adaptive icon)
- Splash screen (`mobile/assets/splash.png`, `splash.backgroundColor`)
- App display name / bundle config in `mobile/app.config.ts` (`name`, `ios.buildNumber`, etc.)
- iOS permissions strings (`infoPlist` usage descriptions)
- `UIBackgroundModes`, Push / VoIP capabilities, Firebase plist
- Native modules or `plugins` in `app.config.ts`
- Notification **tap** handling in `mobile/src/screens/HomeScreen.tsx` (JavaScript bundle — typically via **EAS Update** if you use it; otherwise ship a new build if not using OTA)

**JavaScript-only** changes to the WebView-loaded website deploy with **web** (Vercel/host) and appear on next load without rebuilding the app—unless you pin a specific bundle via native config.

## 10. Commands — web (from repo root)

```bash
npm run build
```

(Use your project’s actual script; confirm `package.json`.)

## 11. Commands — mobile (from `mobile/`)

Validate environment:

```bash
cd mobile
npx expo-doctor
```

iOS production build (EAS):

```bash
cd mobile
npx eas-cli build --platform ios --profile production
```

After a successful build, submit (if configured):

```bash
npx eas-cli submit --platform ios --profile production --latest
```

**Note:** Root `eas.json` vs `mobile/eas.json` — use the config that your team actually points EAS to (often `eas build` is run from `mobile/`).

## 12. Git — commit and push (example)

```bash
git status
git add -A
git commit -m "Release prep: legal pages, production UI gating, App Store checklist"
git push origin HEAD
```

## 13. Manual questions still to answer

- [ ] Canonical **production domain** for public URLs (www vs apps subdomain) for App Store Connect
- [ ] **Location**: whether the shipped app collects location; if yes, disclose accurately in App Privacy
- [ ] **Demo/reviewer account** credentials (store in App Store Connect secure field)
- [ ] **Marketing URL** if you want one listed
- [ ] Final **subtitle** and **keywords** after brand review

## 14. Final QA checklist

1. [ ] Login / logout (web + mobile shell session)
2. [ ] Inbound call (browser + native / CallKit where configured)
3. [ ] Outbound call from keypad
4. [ ] Voicemail received and playback works
5. [ ] SMS send and receive (thread updates)
6. [ ] Lead push: manager opens admin lead detail; non-manager lands on workspace leads list (expected policy)
7. [ ] Missed call push → missed section on workspace calls page
8. [ ] Background / killed app: tap notification opens correct `open_path`
9. [ ] No debug UI (in-call Debug, technical SIDs, dev push footer) in production builds
10. [ ] Icon, splash, app name match App Store listing
11. [ ] `/privacy`, `/terms`, `/support` (and `/security` if linked) load on production domain
12. [ ] Spot-check other footer/nav links on marketing pages

## 15. Notification routing (reference)

| Type | `open_path` (server) | Notes |
|------|------------------------|-------|
| New SMS | `/workspace/phone/inbox?thread=<conversationId>` | Thread selected via query |
| New lead | Managers+: `/admin/crm/leads/<id>` · Others: `/workspace/phone/leads` | Admin blocked for workspace-only roles (redirect) |
| Voicemail | `/workspace/phone/voicemail` | |
| Missed call | `/workspace/phone/calls#workspace-calls-missed-heading` | |
| Incoming call (FCM fallback) | `/workspace/phone/keypad` | VoIP/CallKit path is separate |

Native app: `getInitialNotification` + `onNotificationOpenedApp` apply `open_path` to the WebView; foreground does not auto-navigate in current `HomeScreen` implementation.
