import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TAG = '[SAINTLY-PUSH-DIAG]';

/**
 * Runtime checks for bundle id + Firebase app binding (compare to `GoogleService-Info.plist` in repo).
 * Does not log raw FCM/APNs tokens.
 */
export function logPushRegistrationRuntimeDiagnostics(): void {
  const iosBundle =
    Constants.expoConfig?.ios && typeof Constants.expoConfig.ios === 'object'
      ? (Constants.expoConfig.ios as { bundleIdentifier?: string }).bundleIdentifier
      : undefined;
  const androidPkg =
    Constants.expoConfig?.android && typeof Constants.expoConfig.android === 'object'
      ? (Constants.expoConfig.android as { package?: string }).package
      : undefined;

  console.warn(TAG, 'expo_config_identity', {
    platform: Platform.OS,
    iosBundleIdentifier: iosBundle ?? null,
    androidPackage: androidPkg ?? null,
    expectedBundleId: 'com.saintlyhomehealth.app',
    bundleMatchesExpected:
      Platform.OS === 'ios'
        ? iosBundle === 'com.saintlyhomehealth.app'
        : Platform.OS === 'android'
          ? androidPkg === 'com.saintlyhomehealth.app'
          : null,
    appOwnership: String(Constants.appOwnership ?? ''),
    executionEnvironment: String(Constants.executionEnvironment ?? ''),
    nativeAppVersion: Constants.nativeAppVersion ?? null,
    nativeBuildVersion: Constants.nativeBuildVersion ?? null,
    expoConfigName: Constants.expoConfig?.name ?? null,
    expoConfigSlug: Constants.expoConfig?.slug ?? null,
  });
}

/**
 * After native Firebase loads — confirms which Firebase project the embedded plist/json wired into the binary.
 */
export async function logFirebaseNativeAppOptions(): Promise<void> {
  if (Constants.appOwnership === 'expo') {
    console.warn(TAG, 'firebase_native_options_skipped', { reason: 'expo_go' });
    return;
  }
  try {
    const mod = await import('@react-native-firebase/app');
    const firebase = mod.default;
    const app = firebase.app();
    const o = app.options;
    const appId = typeof o.appId === 'string' ? o.appId : '';
    console.warn(TAG, 'firebase_native_app_options', {
      projectId: o.projectId ?? null,
      messagingSenderId: o.messagingSenderId ?? null,
      /** Last segment of GOOGLE_APP_ID — compare to plist `GOOGLE_APP_ID`. */
      appIdTail: appId.length > 0 ? appId.slice(-18) : null,
      storageBucketTail:
        typeof o.storageBucket === 'string' && o.storageBucket.length > 0
          ? o.storageBucket.slice(-24)
          : null,
    });
    console.warn(TAG, 'firebase_expected_plist', {
      expectedProjectId: 'saintly-softphone',
      expectedBundleInPlist: 'com.saintlyhomehealth.app',
      projectIdMatchesExpected: o.projectId === 'saintly-softphone',
    });
  } catch (e) {
    console.warn(TAG, 'firebase_native_app_options_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
