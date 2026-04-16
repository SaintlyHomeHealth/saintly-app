import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  registerNativePushForCalls,
  type NativePushRegistrationResult,
} from '../services/nativePushService';

export type NativePushHookState =
  | { status: 'idle' }
  | { status: 'ready'; result: NativePushRegistrationResult };

const PushRegistrationContext = createContext<NativePushHookState>({ status: 'idle' });

/**
 * Runs FCM + notification permission as soon as the native app mounts (not tied to a screen).
 * Safe in Expo Go: resolves to `expo_go` with no native Firebase calls from static imports.
 */
export function PushRegistrationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NativePushHookState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await registerNativePushForCalls();
      if (!cancelled) {
        setState({ status: 'ready', result });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PushRegistrationContext.Provider value={state}>{children}</PushRegistrationContext.Provider>
  );
}

/**
 * Result of {@link registerNativePushForCalls} from app launch (see {@link PushRegistrationProvider}).
 */
export function useNativePushRegistration(): NativePushHookState {
  return useContext(PushRegistrationContext);
}
