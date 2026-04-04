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

/**
 * TwiML: Say + Record with recording callback; optional Twilio transcription (enable via env).
 */
export function buildSaintlyVoicemailRecordTwiml(publicBase: string): string {
  const base = publicBase.trim().replace(/\/$/, "");
  const recordingCallback = `${base}/api/twilio/voice/recording`;
  const transcriptionCallback = `${base}/api/twilio/voice/voicemail-transcription`;
  const transcribeEnabled = process.env.TWILIO_VOICEMAIL_TRANSCRIBE === "1";

  const recordAttrs = transcribeEnabled
    ? ` transcribe="true" transcribeCallback="${escapeXml(transcriptionCallback)}"`
    : ` transcribe="false"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(SAINTLY_VOICEMAIL_PROMPT)}</Say>
  <Record
    maxLength="180"
    playBeep="true"${recordAttrs}
    recordingStatusCallback="${escapeXml(recordingCallback)}"
    recordingStatusCallbackMethod="POST"
  />
  <Say voice="Polly.Joanna">${escapeXml("Thank you for calling Saintly Home Health. Goodbye.")}</Say>
</Response>`.trim();
}
