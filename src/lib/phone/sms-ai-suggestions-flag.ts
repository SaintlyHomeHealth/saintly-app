/**
 * SMS thread composer: optional AI draft from OpenAI (stored in `conversations.metadata`).
 * When false, no reply-draft UI, no telemetry round-trips, and no background generation after inbound SMS.
 *
 * Re-enable by setting to `true`. You can still force-disable in an environment with
 * `SMS_AI_SUGGESTIONS_DISABLED=1`.
 */
export const ENABLE_SMS_AI_SUGGESTIONS = false;

/** Reply-draft suggestions for the SMS composer (not CRM drawer or other phone AI). */
export function smsReplyAiSuggestionsEnabled(): boolean {
  if (!ENABLE_SMS_AI_SUGGESTIONS) return false;
  if (process.env.SMS_AI_SUGGESTIONS_DISABLED === "1") return false;
  return true;
}
