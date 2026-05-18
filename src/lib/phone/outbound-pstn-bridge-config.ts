/**
 * CRM / workspace outbound: staff cell first (REST), then patient with Saintly CLI.
 *
 * Env (Vercel / server):
 * - `TWILIO_OUTBOUND_CALL_STRATEGY=pstn_bridge` — use REST staff-first bridge from keypad/CRM.
 * - `TWILIO_OUTBOUND_DISABLE_CLIENT=1` — also forces the PSTN bridge path (outbound does not use Twilio Client).
 * - `TWILIO_OUTBOUND_STAFF_RING_SECONDS` — staff leg ring timeout (default 25, clamp 10–60).
 * - `TWILIO_OUTBOUND_PATIENT_RING_SECONDS` — patient leg &lt;Dial timeout&gt; after press 1 (default 55).
 * - `TWILIO_SOFTPHONE_CALLER_ID_E164` — Saintly DID: staff leg `from`, patient presentation `callerId`.
 * - `TWILIO_OUTBOUND_DEFAULT_STAFF_E164` — fallback when `staff_profiles.sms_notify_phone` is empty.
 * - `TWILIO_OUTBOUND_BRIDGE_SIGNING_SECRET` — optional HMAC secret for bridge tokens (defaults to `TWILIO_AUTH_TOKEN`).
 * - `TWILIO_OUTBOUND_PSTN_BRIDGE_RECORDING_ENABLED` — set `0` to skip dual-channel `Dial` recording + post-call Whisper fallback (default on).
 * - `TWILIO_VOICE_OUTBOUND_PSTN_TRANSCRIPT_ENABLED` — set `false` to disable Real-Time Transcription autostart on outbound PSTN bridge (default on).
 */

const MIN_STAFF_RING = 10;
const MAX_STAFF_RING = 60;
const DEFAULT_STAFF_RING = 25;

const MIN_PATIENT_RING = 15;
const MAX_PATIENT_RING = 120;
const DEFAULT_PATIENT_RING = 55;

/** True when workspace outbound should use Twilio REST → staff cell → press 1 → Dial patient. */
export function shouldUsePstnBridgeOutbound(): boolean {
  const s = process.env.TWILIO_OUTBOUND_CALL_STRATEGY?.trim().toLowerCase() ?? "";
  if (s === "pstn_bridge" || s === "bridge" || s === "click_to_call" || s === "pstn") {
    return true;
  }
  const d = process.env.TWILIO_OUTBOUND_DISABLE_CLIENT?.trim().toLowerCase() ?? "";
  if (d === "1" || d === "true" || d === "yes") {
    return true;
  }
  return false;
}

/** When true, outbound must not use `Device.connect` / native shell VoIP for the PSTN leg. */
export function isOutboundTwilioClientDisabledForOutbound(): boolean {
  const v = process.env.TWILIO_OUTBOUND_DISABLE_CLIENT?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
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
