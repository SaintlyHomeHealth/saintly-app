import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * FCM registration for SMS / inbound-call alerts (APNs transport on iOS via Firebase).
 *
 * Firebase App is initialized automatically on iOS from `GoogleService-Info.plist` (bundled by Expo
 * `ios.googleServicesFile` + `@react-native-firebase/app` — no manual Xcode Firebase SDK setup).
 *
 * Expo Go cannot load native Firebase messaging — use dynamic import only in native builds.
 */

export type NativePushEnvironment = 'expo_go' | 'development_build' | 'standalone' | 'storeClient' | 'unknown';

export type NativePushDiagnostics = {
  appOwnership: string;
  executionEnvironment: string;
  platform: string;
};

export type NativePushRegistrationResult = {
  environment: NativePushEnvironment;
  fcmToken: string | null;
  /** APNs device token (iOS) when Firebase exposes it. */
  apnsDeviceToken: string | null;
  /** Raw numeric status from `requestPermission()` (Firebase AuthorizationStatus on both platforms). */
  permissionStatus: number | null;
  /** Human-readable permission result. */
  permissionLabel: string | null;
  /** Set when registration throws or getToken returns empty unexpectedly. */
  errorText: string | null;
  diagnostics: NativePushDiagnostics;
};

function labelForAuthStatus(
  AuthorizationStatus: {
    NOT_DETERMINED: number;
    DENIED: number;
    AUTHORIZED: number;
    PROVISIONAL: number;
    EPHEMERAL: number;
  },
  status: number
): string {
  const A = AuthorizationStatus;
  if (status === A.NOT_DETERMINED) return 'NOT_DETERMINED';
  if (status === A.DENIED) return 'DENIED';
  if (status === A.AUTHORIZED) return 'AUTHORIZED';
  if (status === A.PROVISIONAL) return 'PROVISIONAL';
  if (status === A.EPHEMERAL) return 'EPHEMERAL';
  return `UNKNOWN(${status})`;
}

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
  /** TestFlight / App Store builds (Expo SDK 50+). */
  if (Constants.executionEnvironment === 'storeClient') {
    return 'storeClient';
  }
  return 'unknown';
}

function buildDiagnostics(): NativePushDiagnostics {
  return {
    appOwnership: String(Constants.appOwnership ?? ''),
    executionEnvironment: String(Constants.executionEnvironment ?? ''),
    platform: Platform.OS,
  };
}

/**
 * Requests notification permission, registers for remote messages (iOS), then resolves FCM token.
 * Call on launch and from debug "refresh" when testing.
 */
export async function registerNativePushForCalls(): Promise<NativePushRegistrationResult> {
  const environment = detectEnvironment();
  const diagnostics = buildDiagnostics();

  const empty = (overrides: Partial<NativePushRegistrationResult>): NativePushRegistrationResult => ({
    environment,
    fcmToken: null,
    apnsDeviceToken: null,
    permissionStatus: null,
    permissionLabel: null,
    errorText: null,
    diagnostics,
    ...overrides,
  });

  if (environment === 'expo_go') {
    console.warn('[SAINTLY-PUSH-START] nativePushService skip_expo_go', diagnostics);
    return empty({ errorText: 'Expo Go — use a dev or release native build.' });
  }

  console.warn('[SAINTLY-PUSH-START] nativePushService begin', diagnostics);

  try {
    const mod = await import('@react-native-firebase/messaging');
    const messaging = mod.default;
    const AuthorizationStatus = mod.AuthorizationStatus;

    /** 1) Permission first (prompts on iOS when undecided). */
    const permissionStatus = await messaging().requestPermission();
    const permissionLabel = labelForAuthStatus(AuthorizationStatus, permissionStatus);
    console.warn('[SAINTLY-PUSH-START] requestPermission', { permissionStatus, permissionLabel });

    if (Platform.OS === 'ios') {
      /** 2) Register with APNs before FCM token on iOS. */
      await messaging().registerDeviceForRemoteMessages();
      console.warn('[SAINTLY-PUSH-START] registerDeviceForRemoteMessages OK');
    }

    /** 3) APNs token (iOS) — may be null briefly; still log. */
    let apnsDeviceToken: string | null = null;
    if (Platform.OS === 'ios') {
      try {
        apnsDeviceToken = await messaging().getAPNSToken();
        console.warn('[SAINTLY-PUSH-START] getAPNSToken', {
          apnsTokenLen: apnsDeviceToken ? apnsDeviceToken.length : 0,
        });
      } catch (apnsErr) {
        const msg = apnsErr instanceof Error ? apnsErr.message : String(apnsErr);
        console.warn('[SAINTLY-PUSH-START] getAPNSToken error', msg);
      }
    }

    /** 4) FCM registration token. */
    const fcmToken = await messaging().getToken();
    console.warn('[SAINTLY-PUSH-START] getToken', { fcmTokenLen: fcmToken ? fcmToken.length : 0 });

    const denied = permissionStatus === AuthorizationStatus.DENIED;
    let errorText: string | null = null;
    if (!fcmToken) {
      errorText = denied
        ? 'No FCM token — notification permission DENIED.'
        : 'getToken returned empty — check Firebase / network / APNs registration.';
    }

    return {
      environment,
      fcmToken: fcmToken || null,
      apnsDeviceToken,
      permissionStatus,
      permissionLabel,
      errorText,
      diagnostics,
    };
  } catch (e) {
    const errorText = e instanceof Error ? e.message : String(e);
    console.warn('[SAINTLY-PUSH-START] registerNativePushForCalls failed', errorText, e);
    return empty({ errorText });
  }
}
