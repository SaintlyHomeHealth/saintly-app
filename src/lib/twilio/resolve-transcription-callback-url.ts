/**
 * Public HTTPS URL Twilio will POST Real-Time Transcription events to.
 * Must match signature validation (see `getTwilioWebhookSignatureUrl`) — same base precedence as other voice webhooks.
 */
export function resolveTranscriptionStatusCallbackUrl(): string | null {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    "";
  if (!base.startsWith("http")) return null;
  return `${base}/api/twilio/voice/transcription-callback`;
}
