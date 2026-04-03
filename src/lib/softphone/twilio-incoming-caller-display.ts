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

function paramValue(p: Record<string, string> | undefined, key: string): string | null {
  if (!p) return null;
  const direct = p[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const lower = p[key.toLowerCase()];
  if (typeof lower === "string" && lower.trim()) return lower.trim();
  return null;
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
    if (v) out.push(v);
  }
  const custom = call.customParameters;
  if (custom) {
    for (const k of CUSTOM_CLI_KEYS) {
      const v = custom.get(k) ?? custom.get(k.toLowerCase());
      if (v?.trim()) out.push(v.trim());
    }
  }
  return out;
}

/**
 * Prefer the candidate whose normalized digit string is longest and has at least 10 digits (NANP / E.164).
 * Ignores `client:*` identities. Returns "" if nothing plausible (avoids showing partial junk like "3766").
 */
export function pickBestPstnCallerRaw(candidates: string[]): string {
  type Row = { raw: string; digits: string; len: number };
  const rows: Row[] = [];
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith("client:")) continue;
    const digits = normalizePhone(raw);
    if (!digits.length) continue;
    rows.push({ raw, digits, len: digits.length });
  }
  const good = rows.filter((r) => r.len >= 10);
  if (!good.length) return "";
  good.sort((a, b) => b.len - a.len);
  return good[0]!.raw;
}

/** Optional `To` when it is a PSTN number (not `client:`) — last-resort CLI on some legs. */
export function pstnToFallbackRaw(call: { parameters?: Record<string, string> }): string {
  const p = call.parameters;
  const toVal = paramValue(p, "To");
  if (!toVal || toVal.toLowerCase().startsWith("client:")) return "";
  const d = normalizePhone(toVal);
  return d.length >= 10 ? toVal : "";
}

/**
 * Single best-effort PSTN / CLI string for workspace incoming UI + CRM lookup.
 */
export function readIncomingCallerRawFromCall(call: Call): string {
  const fromCandidates = collectPstnCallerCandidatesFromCall(call);
  const best = pickBestPstnCallerRaw(fromCandidates);
  if (best) return best;
  const toFallback = pstnToFallbackRaw(call);
  return toFallback;
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

/** Whether `raw` is safe to show as a secondary line (never partial digit junk). */
export function isPlausiblePstnCallerRawForSubline(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  if (raw.toLowerCase().startsWith("client:")) return false;
  return normalizePhone(raw).length >= 10;
}
