/**
 * Opt-in live AI receptionist: default off unless enabled + allowlisted caller From numbers.
 * Does not change Twilio wiring unless the main voice route explicitly redirects.
 */

export function shouldUseAiReceptionistInbound(fromE164: string): boolean {
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
