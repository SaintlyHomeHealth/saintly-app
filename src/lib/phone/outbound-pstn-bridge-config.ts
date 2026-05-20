/**
 * Workspace / CRM outbound call strategy.
 *
 * ## Browser / Voice.js (default — no staff cell, no press 1)
 * Set either of these (or leave strategy unset):
 * - `TWILIO_OUTBOUND_CALL_STRATEGY=browser_first` (aliases: `client`, `softphone`, `browser`, `webrtc`)
 * - Unset `TWILIO_OUTBOUND_CALL_STRATEGY` and unset `TWILIO_OUTBOUND_DISABLE_CLIENT`
 *
 * Flow: `Device.connect({ To: patient })` → `POST /api/twilio/voice/softphone` → `<Dial><Number>patient</Number>`.
 * `TWILIO_VOICE_RING_E164` is **inbound PSTN fallback only**; it is not used for outbound browser calls.
 *
 * ## PSTN bridge / click-to-call (staff cell first, press 1)
 * - Env default: `TWILIO_OUTBOUND_CALL_STRATEGY=pstn_bridge` or `TWILIO_OUTBOUND_DISABLE_CLIENT=1`
 * - Or per-call from the UI: “Call via cell” / “Better audio” (`POST /api/workspace/phone/outbound-pstn-bridge`)
 *   whenever the staff member has `sms_notify_phone` (or `TWILIO_OUTBOUND_DEFAULT_STAFF_E164`).
 *
 * Optional PSTN-bridge tuning:
 * - `TWILIO_OUTBOUND_STAFF_RING_SECONDS` — staff leg ring timeout (default 25, clamp 10–60)
 * - `TWILIO_OUTBOUND_PATIENT_RING_SECONDS` — patient `<Dial>` timeout after press 1 (default 55)
 * - `TWILIO_SOFTPHONE_CALLER_ID_E164` — Saintly DID on staff + patient legs
 * - `TWILIO_OUTBOUND_DEFAULT_STAFF_E164` — fallback when `staff_profiles.sms_notify_phone` is empty
 * - `TWILIO_OUTBOUND_BRIDGE_SIGNING_SECRET` — optional HMAC for bridge tokens (defaults to `TWILIO_AUTH_TOKEN`)
 * - `TWILIO_OUTBOUND_PSTN_BRIDGE_RECORDING_ENABLED` — set `0` to skip dual-channel recording + Whisper
 * - `TWILIO_VOICE_OUTBOUND_PSTN_TRANSCRIPT_ENABLED` — set `false` to disable RT transcription on PSTN bridge
 */

const MIN_STAFF_RING = 10;
const MAX_STAFF_RING = 60;
const DEFAULT_STAFF_RING = 25;

const MIN_PATIENT_RING = 15;
const MAX_PATIENT_RING = 120;
const DEFAULT_PATIENT_RING = 55;

const PSTN_BRIDGE_STRATEGIES = new Set([
  "pstn_bridge",
  "bridge",
  "click_to_call",
  "pstn",
]);

const BROWSER_FIRST_STRATEGIES = new Set([
  "browser_first",
  "client",
  "softphone",
  "browser",
  "webrtc",
  "client_first",
]);

export type OutboundCallStrategy = "browser_first" | "pstn_bridge";

function envOutboundStrategyRaw(): string {
  return process.env.TWILIO_OUTBOUND_CALL_STRATEGY?.trim().toLowerCase() ?? "";
}

function envOutboundClientDisabled(): boolean {
  const v = process.env.TWILIO_OUTBOUND_DISABLE_CLIENT?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Resolved outbound path for workspace keypad / CRM "Call back".
 * Default: `browser_first` (Twilio Voice.js → patient).
 */
export function resolveOutboundCallStrategy(): OutboundCallStrategy {
  if (envOutboundClientDisabled()) {
    return "pstn_bridge";
  }
  const s = envOutboundStrategyRaw();
  if (PSTN_BRIDGE_STRATEGIES.has(s)) {
    return "pstn_bridge";
  }
  if (BROWSER_FIRST_STRATEGIES.has(s)) {
    return "browser_first";
  }
  return "browser_first";
}

/** True when workspace outbound should use Twilio REST → staff cell → press 1 → Dial patient. */
export function shouldUsePstnBridgeOutbound(): boolean {
  return resolveOutboundCallStrategy() === "pstn_bridge";
}

/** When true, outbound must not use `Device.connect` / native shell VoIP for the PSTN leg. */
export function isOutboundTwilioClientDisabledForOutbound(): boolean {
  return envOutboundClientDisabled() || shouldUsePstnBridgeOutbound();
}

/** phone_calls.metadata.source === outbound_pstn_bridge (staff-leg row; preserve patient in to_e164). */
export function isOutboundPstnBridgePhoneCallMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.source === "outbound_pstn_bridge";
}

/** Ring time before Twilio gives up on staff leg (`calls.create` `timeout`, seconds). */
export function resolveOutboundStaffRingSeconds(): number {
  const raw = process.env.TWILIO_OUTBOUND_STAFF_RING_SECONDS?.trim() ?? "";
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_STAFF_RING;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_STAFF_RING;
  return Math.min(MAX_STAFF_RING, Math.max(MIN_STAFF_RING, n));
}

/** `Dial` timeout when calling patient after staff accepts. */
export function resolveOutboundPatientRingSeconds(): number {
  const raw = process.env.TWILIO_OUTBOUND_PATIENT_RING_SECONDS?.trim() ?? "";
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PATIENT_RING;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_PATIENT_RING;
  return Math.min(MAX_PATIENT_RING, Math.max(MIN_PATIENT_RING, n));
}

export function resolveOutboundBridgeSigningSecret(): string {
  const explicit = process.env.TWILIO_OUTBOUND_BRIDGE_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  return process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
}

/** Default on; set `TWILIO_OUTBOUND_PSTN_BRIDGE_RECORDING_ENABLED=0` to disable (reduces Twilio recording cost). */
export function resolveOutboundPstnBridgeDialRecordingEnabled(): boolean {
  const v = process.env.TWILIO_OUTBOUND_PSTN_BRIDGE_RECORDING_ENABLED?.trim().toLowerCase() ?? "";
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}
