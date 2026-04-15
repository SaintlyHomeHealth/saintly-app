/**
 * Twilio Voice.js / TwiML Application: WebRTC legs use `client:<Identity>` in From and/or To.
 * Inbound Voice handlers redirect these legs to softphone / client ring TwiML — not PSTN DID flow.
 */

export function isTwilioVoiceJsClientFrom(from: string | undefined | null): boolean {
  return Boolean(from && from.trim().toLowerCase().startsWith("client:"));
}

export function isTwilioVoiceJsClientTo(to: string | undefined | null): boolean {
  return Boolean(to && to.trim().toLowerCase().startsWith("client:"));
}
