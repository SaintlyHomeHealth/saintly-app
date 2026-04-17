/**
 * Temporary inbound voice debugging (Twilio client vs PSTN fallback).
 * Search logs for `tag: inbound-voice-debug`.
 *
 * PSTN disable: set `TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK=1` to skip all
 * `TWILIO_VOICE_RING_E164` / escalation PSTN legs so only Twilio Voice SDK
 * (browser + mobile VoIP) can answer.
 */

export function isTwilioVoiceDebugPstnFallbackDisabled(): boolean {
  const v = process.env.TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export function uuidTail(id: string): string {
  const t = id.trim();
  if (t.length >= 8) return `${t.slice(0, 4)}…${t.slice(-4)}`;
  return "…";
}

export function logInboundVoiceDebug(event: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      tag: "inbound-voice-debug",
      event,
      ...payload,
    })
  );
}

/**
 * Twilio &lt;Dial action&gt; / status: infer whether the bridged leg was a Voice SDK client or PSTN.
 */
export function inferTwilioDialAnswerPath(toParam: string | undefined | null): "twilio_client_identity" | "pstn_e164" | "unknown" {
  const to = (toParam ?? "").trim();
  if (!to) return "unknown";
  if (to.toLowerCase().startsWith("client:")) return "twilio_client_identity";
  const digits = to.replace(/\D/g, "");
  if (digits.length >= 10) return "pstn_e164";
  return "unknown";
}
