import Constants from 'expo-constants';

/**
 * VoIP / high-priority push for incoming calls (APNs on iOS, FCM on Android).
 *
 * Expo Go cannot register real VoIP or FCM tokens for your bundle id.
 * Use an EAS **development build** + native modules:
 * - iOS: PushKit / CallKit (often via Twilio or community libs)
 * - Android: FCM data messages + ConnectionService
 *
 * This module intentionally does **not** call `getExpoPushTokenAsync` (Expo projectId / EAS),
 * which is unrelated to Twilio Voice and fails confusingly in Expo Go.
 */

export type NativePushEnvironment = 'expo_go' | 'development_build' | 'standalone' | 'unknown';

export type NativePushRegistrationResult = {
  environment: NativePushEnvironment;
  /** FCM device token — TODO: populate in dev build with @react-native-firebase/messaging or equivalent. */
  fcmToken: string | null;
  /** APNs device token — TODO: populate in dev build (often via native VoIP path). */
  apnsDeviceToken: string | null;
};

function detectEnvironment(): NativePushEnvironment {
  /** In Expo Go, `appOwnership` is `"expo"`; standalone / dev builds use `null`. */
  if (Constants.appOwnership === 'expo') {
    return 'expo_go';
  }
  if (Constants.executionEnvironment === 'bare') {
    return 'development_build';
  }
  if (Constants.executionEnvironment === 'standalone') {
    return 'standalone';
  }
  return 'unknown';
}

/**
 * TODO: In a development build, request notification permission only if needed for local alerts,
 * then register for FCM / APNs per your Twilio + Firebase setup.
 * TODO: Send `fcmToken` / VoIP token to your backend so Twilio can reach this device for incoming calls.
 */
export async function registerNativePushForCalls(): Promise<NativePushRegistrationResult> {
  const environment = detectEnvironment();

  if (environment === 'expo_go') {
    if (__DEV__) {
      console.info(
        '[nativePushService] Expo Go — skipping native VoIP/FCM registration (use a development build for real tokens).'
      );
    }
    return {
      environment,
      fcmToken: null,
      apnsDeviceToken: null,
    };
  }

  // TODO: Implement when Firebase + native Twilio push hooks are linked.
  return {
    environment,
    fcmToken: null,
    apnsDeviceToken: null,
  };
}
