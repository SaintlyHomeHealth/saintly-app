/**
 * Opt-in live AI receptionist (Gather + OpenAI on a dedicated path).
 *
 * **Product default:** disabled in code (`TWILIO_AI_RECEPTIONIST_INBOUND_LIVE_DISABLED`).
 */

/** When true, this gate always returns false regardless of env (no accidental live AI). */
export const TWILIO_AI_RECEPTIONIST_INBOUND_LIVE_DISABLED = true;

export function shouldUseAiReceptionistInbound(fromE164: string): boolean {
  if (TWILIO_AI_RECEPTIONIST_INBOUND_LIVE_DISABLED) {
    return false;
  }
  if (process.env.TWILIO_AI_RECEPTIONIST_ENABLED?.trim() !== "true") {
    return false;
  }
  const allow = process.env.TWILIO_AI_RECEPTIONIST_ALLOWLIST?.trim();
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
