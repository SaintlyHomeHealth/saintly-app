import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Single source for Expo config + `extra` passed to the app (see `src/config/env.ts`).
 * Set EXPO_PUBLIC_API_BASE_URL in .env for local overrides.
 *
 * Native Firebase (Expo config plugins only — no manual Xcode CocoaPods Firebase SDK steps):
 * - `GoogleService-Info.plist` / `google-services.json` in this directory; `expo prebuild` / EAS copy
 *   them into the native projects via `@react-native-firebase/app`.
 * - Plugins `@react-native-firebase/app` then `@react-native-firebase/messaging` (order matters).
 * - `expo-build-properties`: `useFrameworks: 'static'` + `forceStaticLinking` for RNFB pods (Expo SDK 54
 *   non-modular React-Core headers; see expo/expo#39607). Twilio Voice pods are unchanged.
 * Bundle id / package must match Firebase: `com.saintlyhomehealth.app`.
 *
 * `expo-dev-client` is only loaded when `EXPO_USE_DEV_CLIENT_PLUGIN=1` (set in eas.json for
 * development / development-device). Production & TestFlight omit it so the config plugin is never
 * resolved (avoids MODULE_NOT_FOUND when EAS_BUILD_PROFILE is not available at config eval time).
 */
const useDevClientPlugin = process.env.EXPO_USE_DEV_CLIENT_PLUGIN === '1';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  /** Shown under the icon and in system UI (softphone / “Saintly Phone” product name). */
  name: 'Saintly Phone',
  slug: 'saintly-phone',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'saintly-softphone',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#f8fbff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.saintlyhomehealth.app',
    /** Push: TestFlight / App Store use production APNs; dev builds may override via profile if needed. */
    entitlements: {
      'aps-environment': 'production',
    },
    /** CFBundleVersion — must increase for each App Store / TestFlight upload. */
    buildNumber: '26',
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'This app requires microphone access to make and receive calls.',
      NSLocationWhenInUseUsageDescription:
        'This app uses location to support call workflows and staff features.',
      /** FCM alerts + Twilio VoIP incoming call (CallKit). */
      UIBackgroundModes: ['audio', 'remote-notification', 'voip'],
      /** Shown when requesting notification permission (SMS / call alerts). */
      NSUserNotificationsUsageDescription:
        'Saintly sends SMS and incoming-call alerts while you are away from the app.',
      /** Standard HTTPS / platform crypto only — aligns with App Store export compliance. */
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.saintlyhomehealth.app',
    /** Must increase for each Play Store upload (keep in sync with iOS buildNumber when practical). */
    versionCode: 26,
    googleServicesFile: './google-services.json',
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    ...(useDevClientPlugin ? (['expo-dev-client'] as const) : []),
    'expo-location',
    'expo-secure-store',
    /** @react-native-firebase/app must run before messaging; expo-build-properties static linking next. */
    '@react-native-firebase/app',
    [
      'expo-build-properties',
      {
        ios: {
          /** Required by firebase-ios-sdk + RN Firebase with Expo. */
          useFrameworks: 'static',
          /**
           * Link these Firebase pods statically so they do not compile as framework modules that
           * import non-modular React-Core headers (RCTConvert.h, RCTBridgeModule.h).
           * Pod names match @react-native-firebase/app (RNFBApp) and messaging (RNFBMessaging).
           */
          forceStaticLinking: ['RNFBApp', 'RNFBMessaging'],
        },
      },
    ],
    '@react-native-firebase/messaging',
  ],
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'https://www.appsaintlyhomehealth.com',
    /** Twilio Voice React Native SDK log level (`error` in production; override via EXPO_PUBLIC_TWILIO_LOG_LEVEL). */
    twilioLogLevel: process.env.EXPO_PUBLIC_TWILIO_LOG_LEVEL?.trim() || 'error',
    eas: {
      projectId: '227fd4b7-157e-4885-aa96-b3ff1130cfdc',
    },
  },
});
