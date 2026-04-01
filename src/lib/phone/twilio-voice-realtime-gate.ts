/**
 * Opt-in OpenAI Realtime voice path. Default off unless enabled + allowlisted From numbers.
 * Does not change main /api/twilio/voice unless that route is wired to redirect here.
 */

export function shouldUseTwilioVoiceRealtimeInbound(fromE164: string): boolean {
  if (process.env.TWILIO_VOICE_REALTIME_ENABLED?.trim() !== "true") {
    return false;
  }
  const allow = process.env.TWILIO_VOICE_REALTIME_ALLOWLIST?.trim();
  if (!allow) {
    return false;
  }
  const from = fromE164.trim();
  const allowed = new Set(
    allow
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return allowed.has(from);
}

export function resolveTwilioRealtimeMediaStreamWssUrl(): string {
  return process.env.TWILIO_REALTIME_MEDIA_STREAM_WSS_URL?.trim().replace(/\/$/, "") ?? "";
}
