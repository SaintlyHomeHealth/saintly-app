import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
      void twilioVoiceService.prepareIosPushRegistryEarly();
      const result = await registerNativePushForCalls();
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
