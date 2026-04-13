import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Single source for Expo config + `extra` passed to the app (see `src/config/env.ts`).
 * Set EXPO_PUBLIC_API_BASE_URL in .env for local overrides.
 *
 * Native Firebase: place `GoogleService-Info.plist` and `google-services.json` in this directory
 * (same paths as `ios.googleServicesFile` / `android.googleServicesFile`). Firebase app IDs must
 * use bundle id / package `com.saintlyhomehealth.app` (must match Firebase app registration).
 *
 * `expo-dev-client` is omitted for `EAS_BUILD_PROFILE=production` so store / TestFlight builds
 * are not development clients.
 */
const isProductionEASBuild = process.env.EAS_BUILD_PROFILE === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  /** Shown under the icon and in system UI — production-facing Saintly Home Health branding. */
  name: 'Saintly Home Health',
  slug: 'saintly-phone',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'saintly-softphone',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#f4f7fb',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.saintlyhomehealth.app',
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'This app requires microphone access to make and receive calls.',
      NSLocationWhenInUseUsageDescription:
        'This app uses location to support call workflows and staff features.',
      /** Standard HTTPS / platform crypto only — aligns with App Store export compliance. */
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#f4f7fb',
    },
    package: 'com.saintlyhomehealth.app',
    googleServicesFile: './google-services.json',
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    ...(isProductionEASBuild ? [] : (['expo-dev-client'] as const)),
    'expo-location',
    '@react-native-firebase/app',
    [
      'expo-build-properties',
      {
        ios: {
          /** Required by firebase-ios-sdk with React Native Firebase. */
          useFrameworks: 'static',
        },
      },
    ],
  ],
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'https://appsaintlyhomehealth.com',
    /** TODO: Twilio Voice React Native — set when wiring native SDK (optional for display/debug only). */
    twilioLogLevel: process.env.EXPO_PUBLIC_TWILIO_LOG_LEVEL?.trim() || 'error',
    eas: {
      projectId: '227fd4b7-157e-4885-aa96-b3ff1130cfdc',
    },
  },
});
