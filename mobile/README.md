# Saintly Phone (Expo)

React Native app for **Saintly Home Health** — Expo SDK 54, TypeScript, structured for a **Twilio Voice** softphone on a **development build**.

## Structure

```
mobile/
├── App.tsx
├── index.ts
├── app.config.ts         # Expo config, Firebase paths, plugins
├── eas.json              # EAS Build profiles (development client)
├── GoogleService-Info.plist   # iOS — placeholder committed; replace from Firebase Console
├── google-services.json       # Android — placeholder committed; replace from Firebase Console
├── src/
│   ├── config/env.ts
│   ├── components/
│   ├── screens/
│   ├── navigation/
│   ├── services/
│   └── theme/
└── assets/
```

## Firebase (native)

Minimal **placeholder** `GoogleService-Info.plist` and `google-services.json` are in `mobile/` so `expo prebuild` succeeds without secrets. **Replace both files** with downloads from Firebase Console before relying on any Firebase or FCM behavior.

1. In Firebase Console, register **iOS** with bundle ID `com.saintlyhomehealth.app` and **Android** with package `com.saintlyhomehealth.app`.
2. Download the real `GoogleService-Info.plist` and `google-services.json` and overwrite the files in **`mobile/`**. The `BUNDLE_ID` / `package_name` must match `app.config.ts`; if you register a new iOS app in Firebase for this bundle ID, use the plist Firebase generates for that app (it includes the correct `GOOGLE_APP_ID`).
3. Run a **development build** — React Native Firebase does not run inside Expo Go once you import native APIs; the config here is for `expo prebuild` / EAS.

Config uses `@react-native-firebase/app` and `expo-build-properties` (`useFrameworks: static` on iOS), per React Native Firebase’s Expo guide.

## Environment

Copy `.env.example` to `.env` and set overrides as needed. Expo inlines `EXPO_PUBLIC_*` at build time.

## Scripts

```bash
cd mobile
npm start              # Dev server (Expo Go for UI-only if you avoid native imports)
npm run start:dev      # Dev server for a custom dev client build
npm run prebuild:clean # Regenerate ios/ android/ (requires Firebase plist/json present)
npm run ios:run        # Build & run iOS locally (after prebuild)
npm run android:run    # Build & run Android locally (after prebuild)
```

## iOS development build (after config)

**Prerequisites:** Xcode, CocoaPods, `GoogleService-Info.plist` and `google-services.json` in `mobile/`.

**Local simulator build and run:**

```bash
cd mobile
npm install
npm run prebuild:clean
npm run ios:run
npm run start:dev
```

Then open the **development build** app (not Expo Go) and connect to Metro.

**EAS cloud build (simulator .app):**

Install the EAS CLI once (`npm install -g eas-cli`), then:

```bash
cd mobile
eas login
eas init          # first time only — links app to an Expo project
eas build --profile development --platform ios
```

Install the artifact on the simulator, then `npm run start:dev` and open the dev client.

For a **physical device**, use profile `development-device` in `eas.json` (set `ios.simulator` false or use a separate profile without `simulator: true`).

## Next integration steps

- **Twilio Voice:** implement `src/services/twilioVoiceService.ts` with the RN SDK after native Firebase / FCM are stable.
- **Access token:** `authTokenService.fetchSoftphoneAccessToken()` — align auth with the web app.
- **Push:** extend `nativePushService.ts` with `@react-native-firebase/messaging` (or PushKit) in the dev build.

## Requirements

- Node 18+
- Xcode + CocoaPods (iOS), Android Studio (Android) for local native builds
- EAS account for cloud builds (optional)
