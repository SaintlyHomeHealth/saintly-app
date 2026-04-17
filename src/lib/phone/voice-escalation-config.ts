/**
 * Hardcoded escalation ladder (Dialpad-style). Tune via env; future: DB-driven steps.
 * Twilio `<Dial timeout>` is the authoritative server-side timer (no client timers).
 */

import { resolveBusinessHoursContext, resolveBusinessHoursScheduleFromEnv } from "@/lib/phone/business-hours";

const DEFAULT_PRIMARY_RING_SECONDS = 10;
const MAX_PRIMARY_RING_SECONDS = 12;
const MIN_PRIMARY_RING_SECONDS = 8;

const DEFAULT_BACKUP_RING_SECONDS = 10;
const DEFAULT_ESCALATION_PSTN_RING_SECONDS = 10;

/** When unset or not `0`, multi-step escalation (primary → backup → PSTN → voicemail) is active. */
export function isVoiceEscalationPipelineEnabled(): boolean {
  return process.env.VOICE_ESCALATION_ENABLED?.trim() !== "0";
}

export function resolveEscalationPrimaryRingTimeoutSeconds(): number {
  const raw = process.env.VOICE_ESCALATION_PRIMARY_RING_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_PRIMARY_RING_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_PRIMARY_RING_SECONDS;
  return Math.min(
    MAX_PRIMARY_RING_SECONDS,
    Math.max(MIN_PRIMARY_RING_SECONDS, n)
  );
}

export function resolveEscalationBackupRingTimeoutSeconds(): number {
  const raw = process.env.VOICE_ESCALATION_BACKUP_RING_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_BACKUP_RING_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_BACKUP_RING_SECONDS;
  return Math.min(45, Math.max(8, n));
}

/** PSTN leg during escalation chain (after browser rings). */
export function resolveEscalationPstnRingTimeoutSeconds(): number {
  const raw = process.env.VOICE_ESCALATION_PSTN_RING_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_ESCALATION_PSTN_RING_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_ESCALATION_PSTN_RING_SECONDS;
  return Math.min(45, Math.max(8, n));
}

/**
 * Fallback PSTN for escalation (e.g. on-call cell). Defaults to TWILIO_VOICE_RING_E164 when unset.
 */
export function readEscalationPstnFallbackE164FromEnv(): string {
  const direct = process.env.TWILIO_VOICE_ESCALATION_PSTN_E164?.trim();
  if (direct) {
    return direct.split(/[,;]/)[0]?.trim()?.replace(/^["']|["']$/g, "") ?? "";
  }
  return process.env.TWILIO_VOICE_RING_E164?.trim().split(/[,;]/)[0]?.trim()?.replace(/^["']|["']$/g, "") ?? "";
}

/**
 * Office open for the current instant. Delegates to {@link resolveBusinessHoursContext}.
 * Legacy: if `TWILIO_BUSINESS_HOURS_WEEKDAY` is unset, treated as always open.
 */
export function isWithinBusinessHoursNow(): boolean {
  return resolveBusinessHoursContext(new Date(), resolveBusinessHoursScheduleFromEnv()).isOpen;
}

export function readAfterHoursPstnE164FromEnv(): string {
  const raw = process.env.TWILIO_VOICE_AFTER_HOURS_PSTN_E164?.trim();
  if (!raw) return "";
  return raw.split(/[,;]/)[0]?.trim()?.replace(/^["']|["']$/g, "") ?? "";
}
