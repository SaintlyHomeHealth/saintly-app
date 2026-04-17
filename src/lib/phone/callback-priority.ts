/**
 * Callback queue priority (deterministic). Lower number = higher priority for sort ascending.
 * 1 — voicemail left
 * 2 — missed call during business hours
 * 3 — missed call after hours / weekend
 */

export const CALLBACK_PRIORITY_VOICEMAIL = 1;
export const CALLBACK_PRIORITY_MISSED_BUSINESS_HOURS = 2;
export const CALLBACK_PRIORITY_MISSED_AFTER_HOURS = 3;

export type CallbackPriorityInput = {
  hasVoicemailRecording: boolean;
  /** Missed / failed inbound with no voicemail. */
  isMissedInbound: boolean;
  /** From routing / business hours snapshot. */
  afterHours: boolean;
};

export function computeCallbackPriority(input: CallbackPriorityInput): number | null {
  if (input.hasVoicemailRecording) {
    return CALLBACK_PRIORITY_VOICEMAIL;
  }
  if (!input.isMissedInbound) {
    return null;
  }
  return input.afterHours ? CALLBACK_PRIORITY_MISSED_AFTER_HOURS : CALLBACK_PRIORITY_MISSED_BUSINESS_HOURS;
}
