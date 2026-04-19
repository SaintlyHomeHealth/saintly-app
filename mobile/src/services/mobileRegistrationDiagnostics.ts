import { mobileRegistrationDebugEnabled } from '../config/env';

/**
 * Counters for isolating registration vs render lag (opt-in logging via
 * EXPO_PUBLIC_MOBILE_REGISTRATION_DEBUG=1 or __DEV__).
 */
export const registrationStats = {
  pushInjectAttempted: 0,
  voiceInjectAttempted: 0,
  pushSkippedByGuard: 0,
  voiceSkippedByGuard: 0,
  pushAckSuccess: 0,
  pushAckFailure: 0,
  voiceAckSuccess: 0,
  voiceAckFailure: 0,
};

export function logRegistrationDebug(message: string, detail?: Record<string, unknown>): void {
  if (!mobileRegistrationDebugEnabled) return;
  if (detail) {
    console.warn('[SAINTLY-REG]', message, detail);
  } else {
    console.warn('[SAINTLY-REG]', message);
  }
}

export function snapshotRegistrationStats(): typeof registrationStats {
  return { ...registrationStats };
}
