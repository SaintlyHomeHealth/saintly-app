import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { Platform, ToastAndroid } from 'react-native';

import {
  registerNativePushForCalls,
  type NativePushRegistrationResult,
} from '../services/nativePushService';
import { twilioVoiceService } from '../services/twilioVoiceService';

export type NativePushHookState =
  | { status: 'idle' }
  | { status: 'ready'; result: NativePushRegistrationResult };

export type PushRegistrationContextValue = {
  state: NativePushHookState;
  /** Re-run permission + registerDeviceForRemoteMessages + getToken (and logs). */
  refreshRegistration: () => Promise<void>;
};

const PushRegistrationContext = createContext<PushRegistrationContextValue | undefined>(undefined);

/**
 * Runs FCM + notification permission as soon as the native app mounts (not tied to a screen).
 * Safe in Expo Go: resolves to `expo_go` with no native Firebase calls from static imports.
 */
export function PushRegistrationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NativePushHookState>({ status: 'idle' });

  const refreshRegistration = useCallback(async () => {
    const result = await registerNativePushForCalls();
    setState({ status: 'ready', result });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Register FCM/APNs for SMS + generic alerts before Twilio touches PushKit (iOS). Ordering
      // avoids edge cases where native Voice init runs first and complicates Firebase token readiness.
      const result = await registerNativePushForCalls();
      if (!cancelled) {
        setState({ status: 'ready', result });
        void twilioVoiceService.prepareIosPushRegistryEarly();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Foreground FCM: iOS banners are enabled via `mobile/firebase.json` presentation options.
   * Android still does not show heads-up for notification payloads while foregrounded — use a short
   * toast for non-call types so SMS / test alerts are visible without touching Twilio VoIP.
   */
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return undefined;

    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const messaging = (await import('@react-native-firebase/messaging')).default;
        unsubscribe = messaging().onMessage(async (remoteMessage) => {
          if (Platform.OS !== 'android') return;
          const dataType =
            typeof remoteMessage.data?.type === 'string' ? remoteMessage.data.type : '';
          if (dataType === 'incoming_call' || dataType === 'incoming_call_backup') {
            return;
          }
          const title = remoteMessage.notification?.title?.trim() || 'Saintly';
          const body = remoteMessage.notification?.body?.trim() || '';
          const line = body ? `${title} — ${body}` : title;
          ToastAndroid.show(line.slice(0, 250), ToastAndroid.LONG);
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({
      state,
      refreshRegistration,
    }),
    [state, refreshRegistration]
  );

  return <PushRegistrationContext.Provider value={value}>{children}</PushRegistrationContext.Provider>;
}

/**
 * Result of {@link registerNativePushForCalls} from app launch (see {@link PushRegistrationProvider}).
 */
export function useNativePushRegistration(): PushRegistrationContextValue {
  const ctx = useContext(PushRegistrationContext);
  if (ctx === undefined) {
    throw new Error('useNativePushRegistration must be used within PushRegistrationProvider');
  }
  return ctx;
}
