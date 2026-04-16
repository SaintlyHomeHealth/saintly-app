import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * FCM registration for SMS / inbound-call alerts (APNs transport on iOS via Firebase).
 *
 * Expo Go cannot load native Firebase messaging — use dynamic import only in native builds.
 */

export type NativePushEnvironment = 'expo_go' | 'development_build' | 'standalone' | 'unknown';

export type NativePushRegistrationResult = {
  environment: NativePushEnvironment;
  fcmToken: string | null;
  /** Reserved — Twilio VoIP uses PushKit inside @twilio/voice-react-native-sdk. */
  apnsDeviceToken: string | null;
};

function detectEnvironment(): NativePushEnvironment {
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

export async function registerNativePushForCalls(): Promise<NativePushRegistrationResult> {
  const environment = detectEnvironment();

  if (environment === 'expo_go') {
    if (__DEV__) {
      console.info(
        '[nativePushService] Expo Go — skipping FCM (use a development or production native build).'
      );
    }
    return {
      environment,
      fcmToken: null,
      apnsDeviceToken: null,
    };
  }

  try {
    const mod = await import('@react-native-firebase/messaging');
    const messaging = mod.default;
    const AuthorizationStatus = mod.AuthorizationStatus;

    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();
    }

    const status = await messaging().requestPermission();
    const ok =
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL ||
      status === AuthorizationStatus.EPHEMERAL;

    if (!ok && __DEV__) {
      console.warn('[nativePushService] notification permission status:', status);
    }

    const fcmToken = await messaging().getToken();
    return {
      environment,
      fcmToken: fcmToken || null,
      apnsDeviceToken: null,
    };
  } catch (e) {
    console.warn('[nativePushService] FCM registration failed', e);
    return {
      environment,
      fcmToken: null,
      apnsDeviceToken: null,
    };
  }
}
