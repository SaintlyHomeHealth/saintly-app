/**
 * Detect whether a Twilio `<Dial action>` callback represents a real human bridge.
 * Short "completed" legs often come from carrier voicemail or press-1 screening answering
 * without connecting the inbound caller — those must fall through to Saintly voicemail.
 */

const MIN_BRIDGED_SECONDS = 5;

export function isTwilioDialLegBridged(params: Record<string, string | undefined>): boolean {
  const status = (params.DialCallStatus ?? "").trim().toLowerCase();
  if (status !== "completed") {
    return false;
  }

  const durRaw = (params.DialCallDuration ?? params.DialBridgedDuration ?? "").trim();
  if (!durRaw || !/^\d+$/.test(durRaw)) {
    return false;
  }

  const sec = Number.parseInt(durRaw, 10);
  return Number.isFinite(sec) && sec >= MIN_BRIDGED_SECONDS;
}
