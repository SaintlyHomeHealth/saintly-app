/**
 * Detect whether a Twilio `<Dial action>` callback represents a real human bridge.
 * PSTN legs: short "completed" often means carrier voicemail / press-1 screening — fall through to voicemail.
 * Browser `<Client>` legs: `completed` means staff answered and the bridge ran (duration may be 0 on quick hangups).
 */

const MIN_PSTN_BRIDGED_SECONDS = 5;

function isBrowserClientDialLeg(params: Record<string, string | undefined>): boolean {
  for (const key of ["To", "Called", "DialCallTo"] as const) {
    const v = (params[key] ?? "").trim().toLowerCase();
    if (v.startsWith("client:")) {
      return true;
    }
  }
  return false;
}

export function isTwilioDialLegBridged(params: Record<string, string | undefined>): boolean {
  const status = (params.DialCallStatus ?? "").trim().toLowerCase();
  if (status !== "completed") {
    return false;
  }

  if (isBrowserClientDialLeg(params)) {
    return true;
  }

  const durRaw = (params.DialCallDuration ?? params.DialBridgedDuration ?? "").trim();
  if (!durRaw || !/^\d+$/.test(durRaw)) {
    return false;
  }

  const sec = Number.parseInt(durRaw, 10);
  return Number.isFinite(sec) && sec >= MIN_PSTN_BRIDGED_SECONDS;
}
