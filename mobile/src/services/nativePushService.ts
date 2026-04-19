import Constants from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';

import { mobileDiagnosticsEnabled } from '../config/env';
import { diagWarn } from '../utils/mobileDiagnostics';

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
    diagWarn('[nativePushService] skip (Expo Go)', diagnostics);
    return empty({ errorText: 'Expo Go — use a dev or release native build.' });
  }

  const wallTs = () => Date.now();
  diagWarn('[nativePushService] start', { ts: wallTs(), ...diagnostics });

  try {
    const mod = await import('@react-native-firebase/messaging');
    const messaging = mod.default;
    const AuthorizationStatus = mod.AuthorizationStatus;

    /**
     * Android 13+ (API 33): POST_NOTIFICATIONS is required for FCM notification display.
     * RN Firebase docs: `requestPermission()` alone is not sufficient on API 33+.
     */
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const post = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        diagWarn('[nativePushService] POST_NOTIFICATIONS', post);
      } catch (permErr) {
        const msg = permErr instanceof Error ? permErr.message : String(permErr);
        diagWarn('[nativePushService] POST_NOTIFICATIONS request failed', msg);
      }
    }

    /** 1) Permission first (prompts on iOS when undecided). */
    const permissionStatus = await messaging().requestPermission();
    const permissionLabel = labelForAuthStatus(AuthorizationStatus, permissionStatus);
    diagWarn('[nativePushService] requestPermission', {
      ts: wallTs(),
      permissionStatus,
      permissionLabel,
    });

    if (Platform.OS === 'ios') {
      /** 2) Register with APNs before FCM token on iOS. */
      const regStart = wallTs();
      await messaging().registerDeviceForRemoteMessages();
      diagWarn('[nativePushService] registerDeviceForRemoteMessages OK', {
        ts: wallTs(),
        ms: wallTs() - regStart,
      });
    }

    /**
     * 3) APNs device token (iOS) — often null for a short window after step 2. Alert FCM may not
     * deliver reliably until APNs is linked; poll briefly before `getToken` + server registration.
     */
    let apnsDeviceToken: string | null = null;
    if (Platform.OS === 'ios') {
      const apnsWaitStart = wallTs();
      const timeoutMs = 12_000;
      const intervalMs = 280;
      try {
        while (wallTs() - apnsWaitStart < timeoutMs) {
          try {
            apnsDeviceToken = await messaging().getAPNSToken();
          } catch (apnsErr) {
            if (mobileDiagnosticsEnabled) {
              const msg = apnsErr instanceof Error ? apnsErr.message : String(apnsErr);
              diagWarn('[nativePushService] getAPNSToken error (poll)', msg);
            }
          }
          if (apnsDeviceToken) break;
          await new Promise((r) => setTimeout(r, intervalMs));
        }
        diagWarn('[nativePushService] getAPNSToken', {
          ts: wallTs(),
          waitMs: wallTs() - apnsWaitStart,
          hasToken: Boolean(apnsDeviceToken),
          preview: apnsDeviceToken ? `${apnsDeviceToken.slice(0, 16)}… (len ${apnsDeviceToken.length})` : null,
        });
      } catch (apnsErr) {
        const msg = apnsErr instanceof Error ? apnsErr.message : String(apnsErr);
        console.warn('[nativePushService] getAPNSToken fatal', msg);
      }
    }

    /** 4) FCM registration token. */
    const tokenStart = wallTs();
    const fcmToken = await messaging().getToken();
    diagWarn('[nativePushService] getToken', {
      ts: wallTs(),
      getTokenMs: wallTs() - tokenStart,
      token: fcmToken ? `${fcmToken.slice(0, 24)}… (len ${fcmToken.length})` : 'empty/null',
    });

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
    console.warn('[nativePushService] registerNativePushForCalls failed', errorText, e);
    return empty({ errorText });
  }
}
