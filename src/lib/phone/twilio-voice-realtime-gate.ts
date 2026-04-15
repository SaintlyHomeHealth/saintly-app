/**
 * Opt-in OpenAI Realtime voice path (inbound Media Streams → Railway bridge).
 *
 * **Product default:** inbound live AI is disabled in code (`TWILIO_VOICE_INBOUND_LIVE_AI_ENABLED`).
 * Env flags alone cannot turn it back on; re-enable only with an intentional code change.
 */

import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";

/** When false, inbound `<Connect><Stream>` / OpenAI realtime is never selected (fail-safe). */
export const TWILIO_VOICE_INBOUND_LIVE_AI_ENABLED = false;

export type RealtimeInboundGateSnapshot = {
  streamUrlTrimmed: string;
  streamUrlPresent: boolean;
  /** Informational: Twilio Media Streams expect wss://; routing does not use this flag. */
  streamUrlValidWssFormat: boolean;
  realtimeEnabled: boolean;
  allowlistRawLength: number;
  allowlistEntries: string[];
  /** True when allowlist includes the `*` token (any caller allowed for inbound realtime). */
  allowlistWildcardEnabled: boolean;
  /** True when normalized From exactly matches a non-`*` allowlist entry. */
  allowlistExplicitNumberMatch: boolean;
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

/** @deprecated Prefer {@link resolveTwilioMediaStreamWssUrl} — kept for call sites; same resolution. */
export function resolveTwilioRealtimeMediaStreamWssUrl(): string {
  return resolveTwilioMediaStreamWssUrl();
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
  const allowlistWildcardEnabled = allowlistEntries.includes("*");
  const entriesWithoutWildcard = allowlistEntries.filter((e) => e !== "*");
  const allowlistExplicitNumberMatch = entriesWithoutWildcard.includes(fromNormalized);
  const fromInAllowlist =
    allowlistEntries.length > 0 &&
    (allowlistWildcardEnabled || allowlistEntries.includes(fromNormalized));
  const shouldUseInbound =
    TWILIO_VOICE_INBOUND_LIVE_AI_ENABLED && shouldUseTwilioVoiceRealtimeInbound(fromNormalized);
  return {
    streamUrlTrimmed,
    streamUrlPresent,
    streamUrlValidWssFormat,
    realtimeEnabled,
    allowlistRawLength: allowRaw.length,
    allowlistEntries,
    allowlistWildcardEnabled,
    allowlistExplicitNumberMatch,
    fromE164: fromNormalized,
    fromInAllowlist,
    shouldUseInbound,
    useRealtime: TWILIO_VOICE_INBOUND_LIVE_AI_ENABLED && streamUrlPresent && shouldUseInbound,
  };
}
