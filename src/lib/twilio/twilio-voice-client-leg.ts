/**
 * Twilio Voice.js / TwiML Application: WebRTC legs use `client:<Identity>` in From and/or To.
 * The AI receptionist entrypoints (`/api/twilio/voice` → `/realtime`, `/ai-answer`) must not run
 * for these — they are staff browser softphone legs, not PSTN callers to the main DID.
 */

export function isTwilioVoiceJsClientFrom(from: string | undefined | null): boolean {
  return Boolean(from && from.trim().toLowerCase().startsWith("client:"));
}

export function isTwilioVoiceJsClientTo(to: string | undefined | null): boolean {
  return Boolean(to && to.trim().toLowerCase().startsWith("client:"));
}
