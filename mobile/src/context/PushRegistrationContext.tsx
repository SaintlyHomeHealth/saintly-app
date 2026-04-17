import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  registerNativePushForCalls,
  type NativePushRegistrationResult,
} from '../services/nativePushService';
import {
  logFirebaseNativeAppOptions,
  logPushRegistrationRuntimeDiagnostics,
} from '../services/pushRegistrationDiagnostics';
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
    console.warn('[SAINTLY-PUSH-START] refreshRegistration (user requested)');
    const result = await registerNativePushForCalls();
    console.warn('[SAINTLY-PUSH-START] refreshRegistration result', {
      fcmTokenLen: result.fcmToken?.length ?? 0,
      apnsTokenLen: result.apnsDeviceToken?.length ?? 0,
      permissionLabel: result.permissionLabel,
      errorText: result.errorText,
    });
    setState({ status: 'ready', result });
  }, []);

  useEffect(() => {
    logPushRegistrationRuntimeDiagnostics();
    let cancelled = false;
    void (async () => {
      console.warn('[SAINTLY-PUSH-START] PushRegistrationProvider mount');
      await logFirebaseNativeAppOptions();
      void twilioVoiceService.prepareIosPushRegistryEarly();
      const result = await registerNativePushForCalls();
      console.warn('[SAINTLY-PUSH-START] registerNativePushForCalls result', {
        environment: result.environment,
        fcmTokenLen: result.fcmToken?.length ?? 0,
        apnsTokenLen: result.apnsDeviceToken?.length ?? 0,
        permissionLabel: result.permissionLabel,
        errorText: result.errorText,
      });
      if (!cancelled) {
        setState({ status: 'ready', result });
      }
    })();
    return () => {
      cancelled = true;
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
