/**
 * Shared Twilio Voice voicemail TwiML (Record + callbacks) for Saintly inbound flows.
 * Used by dial handoff, browser fallback, AI-answer fallbacks, and /voicemail-prompt.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const SAINTLY_VOICEMAIL_PROMPT =
  "We're sorry we missed your call. Please leave your name, number, and reason for calling after the tone.";

/** Business-hours missed (no answer after ringing staff / office lines). */
export const SAINTLY_VOICEMAIL_PROMPT_BUSINESS_HOURS =
  "Thank you for calling Saintly Home Health. We are unable to take your call right now. Please leave your name, phone number, and a brief message after the tone, and we will return your call as soon as possible.";

/** After-hours / weekend — office closed. */
export const SAINTLY_VOICEMAIL_PROMPT_AFTER_HOURS =
  "You have reached Saintly Home Health outside of our regular office hours. Please leave your name, phone number, and reason for calling after the tone. If this is urgent, say so in your message and we will follow up.";

/**
 * Prefer TWILIO_PUBLIC_BASE_URL; fall back to TWILIO_WEBHOOK_BASE_URL (origin only in env).
 */
export function resolveTwilioVoicePublicBase(): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

export type VoicemailGreetingKind = "default" | "business_hours" | "after_hours";

function resolveVoicemailPrompt(kind: VoicemailGreetingKind): string {
  if (kind === "business_hours") return SAINTLY_VOICEMAIL_PROMPT_BUSINESS_HOURS;
  if (kind === "after_hours") return SAINTLY_VOICEMAIL_PROMPT_AFTER_HOURS;
  return SAINTLY_VOICEMAIL_PROMPT;
}

/**
 * TwiML: Say + Record with recording callback; optional Twilio transcription (enable via env).
 */
export function buildSaintlyVoicemailRecordTwiml(
  publicBase: string,
  options?: { greeting?: VoicemailGreetingKind }
): string {
  const base = publicBase.trim().replace(/\/$/, "");
  const recordingCallback = `${base}/api/twilio/voice/recording`;
  const transcriptionCallback = `${base}/api/twilio/voice/voicemail-transcription`;
  const transcribeEnabled = process.env.TWILIO_VOICEMAIL_TRANSCRIBE === "1";

  const recordAttrs = transcribeEnabled
    ? ` transcribe="true" transcribeCallback="${escapeXml(transcriptionCallback)}"`
    : ` transcribe="false"`;

  const prompt = resolveVoicemailPrompt(options?.greeting ?? "default");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(prompt)}</Say>
  <Record
    maxLength="180"
    playBeep="true"${recordAttrs}
    recordingStatusCallback="${escapeXml(recordingCallback)}"
    recordingStatusCallbackMethod="POST"
  />
  <Say voice="Polly.Joanna">${escapeXml("Thank you for calling Saintly Home Health. Goodbye.")}</Say>
</Response>`.trim();
}
