/**
 * Inbound PSTN → ring target ordering (browser vs cell/office).
 *
 * **Product default:** `browser_first` — Voice.js / mobile clients ring with caller/lead context in the
 * Saintly UI; PSTN (`TWILIO_VOICE_RING_E164`) is fallback after no-answer.
 *
 * Vercel inbound (app/browser/team ringing, ~25s, no long cascade):
 * - `TWILIO_VOICE_INBOUND_RING_STRATEGY=browser_first` (or unset — code default)
 * - `TWILIO_VOICE_BROWSER_RING_SECONDS=25`
 * - `TWILIO_VOICE_RING_TIMEOUT_SECONDS=25` (PSTN fallback leg after browser timeout)
 * - `VOICE_ESCALATION_ENABLED=0` — use single browser→PSTN handoff, not primary→backup→PSTN ladder
 * - `VOICE_BUSINESS_ROUTING_ENABLED=0` — skip multi-step `/inbound-dial-cascade` (optional if ring groups are minimal)
 * - Unset `TWILIO_VOICE_DISABLE_BROWSER_RING`, `TWILIO_VOICE_TEAM_RING_E164S`, `TWILIO_VOICE_PRIMARY_ROUTE=pstn`
 * - `TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED=false` — no auto Real-Time Transcription on answer
 *
 * Outbound browser (default): unset strategy or `TWILIO_OUTBOUND_CALL_STRATEGY=browser_first` — see `outbound-pstn-bridge-config.ts`.
 * Outbound PSTN bridge (optional): `TWILIO_OUTBOUND_CALL_STRATEGY=pstn_bridge` or `TWILIO_OUTBOUND_DISABLE_CLIENT=1`.
 *
 * @see TWILIO_VOICE_INBOUND_RING_STRATEGY
 * @see TWILIO_VOICE_DISABLE_BROWSER_RING
 */

export type VoiceInboundRingStrategy = "pstn_first" | "browser_first" | "pstn_only";

const DEFAULT_PSTN_ONLY_RING_SECONDS = 25;
const MIN_PSTN_ONLY_RING_SECONDS = 15;
const MAX_PSTN_ONLY_RING_SECONDS = 45;

/**
 * Ring duration for `pstn_only` and single-step PSTN legs when browser ringing is disabled.
 * Override with `TWILIO_VOICE_PSTN_ONLY_RING_SECONDS` or `TWILIO_VOICE_RING_TIMEOUT_SECONDS`.
 */
export function resolvePstnOnlyInboundDialTimeoutSeconds(): number {
  const raw =
    process.env.TWILIO_VOICE_PSTN_ONLY_RING_SECONDS?.trim() ||
    process.env.TWILIO_VOICE_RING_TIMEOUT_SECONDS?.trim() ||
    "";
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_PSTN_ONLY_RING_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_PSTN_ONLY_RING_SECONDS;
  return Math.min(
    MAX_PSTN_ONLY_RING_SECONDS,
    Math.max(MIN_PSTN_ONLY_RING_SECONDS, n)
  );
}

function envForcesPstnOnly(): boolean {
  const d = process.env.TWILIO_VOICE_DISABLE_BROWSER_RING?.trim().toLowerCase() ?? "";
  return d === "1" || d === "true" || d === "yes";
}

/**
 * - `pstn_only`: only &lt;Number&gt; legs toward `TWILIO_VOICE_RING_E164` (etc.), then voicemail — no &lt;Client&gt;.
 * - `pstn_first`: PSTN/cell before browser softphones.
 * - `browser_first` (default when not overridden): ring Voice.js clients first, then PSTN fallback.
 *
 * Aliases: `TWILIO_INBOUND_RING_STRATEGY` (same as `TWILIO_VOICE_INBOUND_RING_STRATEGY`),
 * `TWILIO_VOICE_PRIMARY_ROUTE` (`pstn`|`browser`).
 * `TWILIO_VOICE_DISABLE_BROWSER_RING=1` forces `pstn_only` regardless of strategy string.
 */
export function resolveVoiceInboundRingStrategy(): VoiceInboundRingStrategy {
  if (envForcesPstnOnly()) {
    return "pstn_only";
  }

  const a =
    process.env.TWILIO_VOICE_INBOUND_RING_STRATEGY?.trim().toLowerCase() ??
    process.env.TWILIO_INBOUND_RING_STRATEGY?.trim().toLowerCase() ??
    "";
  const primaryRoute = process.env.TWILIO_VOICE_PRIMARY_ROUTE?.trim().toLowerCase() ?? "";

  if (a === "pstn_only" || a === "phone_only") {
    return "pstn_only";
  }
  if (a === "browser_first" || a === "client_first") {
    return "browser_first";
  }
  if (a === "pstn_first" || a === "pstn") {
    return "pstn_first";
  }
  if (primaryRoute === "browser" || primaryRoute === "client") {
    return "browser_first";
  }
  if (primaryRoute === "pstn" || primaryRoute === "cell" || primaryRoute === "pstn_first") {
    return "pstn_first";
  }
  if (primaryRoute === "pstn_only" || primaryRoute === "phone_only") {
    return "pstn_only";
  }

  return "browser_first";
}
