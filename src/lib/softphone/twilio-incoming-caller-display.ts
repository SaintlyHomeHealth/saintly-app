import type { Call } from "@twilio/voice-sdk";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";

/** Keys Twilio may send on a Client incoming leg (incl. after transfer). Order does not matter; we score by digit length. */
const PSTN_CLI_PARAMETER_KEYS = [
  "From",
  "ForwardedFrom",
  "CallerId",
  "RemoteNumber",
  "OriginationNumber",
] as const;

const CUSTOM_CLI_KEYS = [
  "from",
  "caller",
  "callerNumber",
  "caller_number",
  "pstnFrom",
  "pstn_from",
  "originalFrom",
  "original_from",
  "OriginalCaller",
] as const;

/** E.164 allows at most 15 digits (excluding country-code formatting). */
const MAX_PSTN_CLI_DIGITS = 15;

function paramValue(p: Record<string, string> | undefined, key: string): string | null {
  if (!p) return null;
  const direct = p[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const lower = p[key.toLowerCase()];
  if (typeof lower === "string" && lower.trim()) return lower.trim();
  return null;
}

/**
 * UUID / 32-hex tokens must never be treated as PSTN (digits-only length can beat real +1… and win "best").
 */
export function looksLikeUuidOrHexOpaqueCli(raw: string): boolean {
  const t = raw.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^[0-9a-f]{32}$/i.test(t.replace(/-/g, ""))) return true;
  return false;
}

function isPlausiblePstnDigitLength(digitCount: number): boolean {
  return digitCount >= 10 && digitCount <= MAX_PSTN_CLI_DIGITS;
}

/**
 * True when `raw` is suitable as a display/lookup PSTN CLI (not client:, not opaque id).
 */
function isUsablePstnCliRaw(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const v = raw.trim();
  if (v.toLowerCase().startsWith("client:")) return false;
  if (looksLikeUuidOrHexOpaqueCli(v)) return false;
  const d = normalizePhone(v);
  return isPlausiblePstnDigitLength(d.length);
}

/**
 * Collect PSTN-oriented CLI strings from Twilio Voice JS `Call` (no blind scan of all
 * `parameters` — avoids matching CallSid-like numeric tails).
 */
export function collectPstnCallerCandidatesFromCall(call: {
  parameters?: Record<string, string>;
  customParameters?: Map<string, string>;
}): string[] {
  const out: string[] = [];
  const p = call.parameters;
  for (const k of PSTN_CLI_PARAMETER_KEYS) {
    const v = paramValue(p, k);
    if (v && isUsablePstnCliRaw(v)) out.push(v);
  }
  const custom = call.customParameters;
  if (custom) {
    for (const k of CUSTOM_CLI_KEYS) {
      const v = custom.get(k) ?? custom.get(k.toLowerCase());
      if (v?.trim() && isUsablePstnCliRaw(v)) out.push(v.trim());
    }
    /** Custom map may include duplicate keys; only values that look like real phone IDs. */
    for (const v of custom.values()) {
      const t = (v ?? "").trim();
      if (t && isUsablePstnCliRaw(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Prefer the candidate whose normalized digit string is longest among plausible PSTN values.
 * Ignores `client:*` and UUID-like tokens (never pick hex/UUID over real +1…).
 */
export function pickBestPstnCallerRaw(candidates: string[]): string {
  type Row = { raw: string; digits: string; len: number };
  const rows: Row[] = [];
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith("client:")) continue;
    if (looksLikeUuidOrHexOpaqueCli(raw)) continue;
    const digits = normalizePhone(raw);
    if (!isPlausiblePstnDigitLength(digits.length)) continue;
    rows.push({ raw, digits, len: digits.length });
  }
  const good = rows.filter((r) => r.len >= 10);
  if (!good.length) return "";
  good.sort((a, b) => b.len - a.len);
  return good[0]!.raw;
}

/**
 * Single best-effort PSTN / CLI string for workspace incoming UI + CRM lookup.
 * Prefer Twilio `parameters.From` (same PSTN identity native SDK uses) before customParameters.
 * Does not fall back to `To` (that is typically our DID on inbound PSTN, not the caller).
 */
export function readIncomingCallerRawFromCall(call: Call): string {
  const p = call.parameters;
  for (const k of PSTN_CLI_PARAMETER_KEYS) {
    const v = paramValue(p, k);
    if (v && isUsablePstnCliRaw(v)) return v.trim();
  }

  const fromCandidates = collectPstnCallerCandidatesFromCall(call);
  const best = pickBestPstnCallerRaw(fromCandidates);
  return best ?? "";
}

export function formatInboundCallerFromRaw(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith("client:")) {
    return "Internal / browser call";
  }
  const digits = normalizePhone(raw);
  if (digits.length >= 10) {
    return formatPhoneNumber(raw);
  }
  if (!raw.trim()) return "Unknown caller";
  return "Caller ID unavailable";
}

/** Whether `raw` is safe to show as a secondary line (never partial digit junk / UUID). */
export function isPlausiblePstnCallerRawForSubline(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  if (raw.toLowerCase().startsWith("client:")) return false;
  if (looksLikeUuidOrHexOpaqueCli(raw)) return false;
  const d = normalizePhone(raw);
  return isPlausiblePstnDigitLength(d.length);
}

const SAINTLY_INBOUND_DEBUG_PREFIX = "[SAINTLY-INBOUND-DEBUG]";

/**
 * Temporary browser-only diagnostics for inbound PSTN selection (remove after debugging).
 * Does not change behavior.
 */
export function debugLogSaintlyInboundBrowserPstn(call: Call): void {
  if (typeof window === "undefined") return;
  try {
    const p = call.parameters ?? {};
    console.log(SAINTLY_INBOUND_DEBUG_PREFIX, "call.parameters", { ...p });

    const cm = call.customParameters;
    const customPlain = cm ? Object.fromEntries(cm.entries()) : null;
    console.log(SAINTLY_INBOUND_DEBUG_PREFIX, "call.customParameters", customPlain);

    const standardByKey: Record<string, string | null> = {};
    for (const k of PSTN_CLI_PARAMETER_KEYS) {
      standardByKey[k] = paramValue(call.parameters, k);
    }
    console.log(SAINTLY_INBOUND_DEBUG_PREFIX, "standardPstnParameterValuesByKey", standardByKey);

    const filteredCandidates = collectPstnCallerCandidatesFromCall(call);
    console.log(SAINTLY_INBOUND_DEBUG_PREFIX, "pstnCandidatesPassingIsUsablePstnCliRaw", filteredCandidates);

    const chosen = readIncomingCallerRawFromCall(call);
    console.log(SAINTLY_INBOUND_DEBUG_PREFIX, "readIncomingCallerRawFromCall()", chosen);
  } catch (e) {
    console.warn(SAINTLY_INBOUND_DEBUG_PREFIX, "debugLogSaintlyInboundBrowserPstn error", e);
  }
}
