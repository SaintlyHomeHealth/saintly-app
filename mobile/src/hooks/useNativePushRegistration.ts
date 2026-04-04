import { useEffect, useState } from 'react';

import { registerNativePushForCalls, type NativePushRegistrationResult } from '../services/nativePushService';

export type NativePushHookState =
  | { status: 'idle' }
  | { status: 'ready'; result: NativePushRegistrationResult };

/**
 * Registers native push capabilities for **incoming call** signaling (APNs / FCM).
 * Safe in Expo Go: no Expo push token, no projectId — returns a clear `expo_go` environment.
 */
export function useNativePushRegistration(): NativePushHookState {
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

  return state;
}
