/**
 * Opt-in OpenAI Realtime voice path. Default off unless enabled + allowlisted From numbers.
 * Does not change main /api/twilio/voice unless that route is wired to redirect here.
 *
 * Allowlist: comma-separated E.164 numbers, or include `*` alone (or with commas) to allow any
 * caller while TWILIO_VOICE_REALTIME_ENABLED=true — use `*` only for short-lived testing.
 */

export type RealtimeInboundGateSnapshot = {
  streamUrlTrimmed: string;
  streamUrlPresent: boolean;
  /** Informational: Twilio Media Streams expect wss://; routing does not use this flag. */
  streamUrlValidWssFormat: boolean;
  realtimeEnabled: boolean;
  allowlistRawLength: number;
  allowlistEntries: string[];
  fromE164: string;
  fromInAllowlist: boolean;
  shouldUseInbound: boolean;
  useRealtime: boolean;
};

function parseAllowlistEntries(allowRaw: string): string[] {
  return allowRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shouldUseTwilioVoiceRealtimeInbound(fromE164: string): boolean {
  if (process.env.TWILIO_VOICE_REALTIME_ENABLED?.trim() !== "true") {
    return false;
  }
  const allow = process.env.TWILIO_VOICE_REALTIME_ALLOWLIST?.trim();
  if (!allow) {
    return false;
  }
  const from = fromE164.trim();
  const entries = parseAllowlistEntries(allow);
  if (entries.includes("*")) {
    return true;
  }
  return entries.includes(from);
}

export function resolveTwilioRealtimeMediaStreamWssUrl(): string {
  return process.env.TWILIO_REALTIME_MEDIA_STREAM_WSS_URL?.trim().replace(/\/$/, "") ?? "";
}

/**
 * Read-only snapshot for production diagnostics (same gating as {@link shouldUseTwilioVoiceRealtimeInbound} + stream URL).
 */
export function getRealtimeInboundGateSnapshot(fromE164: string): RealtimeInboundGateSnapshot {
  const streamUrlTrimmed = resolveTwilioRealtimeMediaStreamWssUrl();
  const streamUrlPresent = Boolean(streamUrlTrimmed);
  const streamUrlValidWssFormat =
    streamUrlTrimmed.length > 0 && /^wss:\/\/.+/i.test(streamUrlTrimmed);
  const realtimeEnabled = process.env.TWILIO_VOICE_REALTIME_ENABLED?.trim() === "true";
  const allowRaw = process.env.TWILIO_VOICE_REALTIME_ALLOWLIST?.trim() ?? "";
  const allowlistEntries = parseAllowlistEntries(allowRaw);
  const fromNormalized = fromE164.trim();
  const allowAll = allowlistEntries.includes("*");
  const fromInAllowlist =
    allowlistEntries.length > 0 &&
    (allowAll || allowlistEntries.includes(fromNormalized));
  const shouldUseInbound = shouldUseTwilioVoiceRealtimeInbound(fromNormalized);
  return {
    streamUrlTrimmed,
    streamUrlPresent,
    streamUrlValidWssFormat,
    realtimeEnabled,
    allowlistRawLength: allowRaw.length,
    allowlistEntries,
    fromE164: fromNormalized,
    fromInAllowlist,
    shouldUseInbound,
    useRealtime: streamUrlPresent && shouldUseInbound,
  };
}
