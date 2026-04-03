import { normalizeDialInputToE164 } from "../softphone/phone-number";

/**
 * Digit-only key for comparing Twilio E.164 / SIP-style values (avoids +1 vs 10-digit mismatches).
 */
export function phoneKeyForLoopCompare(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const e164 = normalizeDialInputToE164(raw.trim());
  if (e164) {
    return e164.replace(/\D/g, "");
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits.length > 0 ? digits : null;
}

function parseExtraAiInboundKeys(): string[] {
  const combined =
    [
      process.env.TWILIO_VOICE_AI_INBOUND_E164?.trim() ?? "",
      process.env.TWILIO_VOICE_AI_INBOUND_NUMBERS?.trim() ?? "",
    ]
      .filter(Boolean)
      .join(",");
  if (!combined) return [];
  const out: string[] = [];
  for (const part of combined.split(/[,;\s]+/)) {
    const k = phoneKeyForLoopCompare(part);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * True when dialing `handoffPstn` would place a new inbound on the same Voice URL as AI (infinite loop).
 * Compares to the live call's `To` (your Twilio number) plus optional env blocklist.
 */
export function isPstnHandoffAiLoopRisk(handoffPstnRaw: string, inboundToRaw: string): boolean {
  const target = phoneKeyForLoopCompare(handoffPstnRaw);
  const inboundTo = phoneKeyForLoopCompare(inboundToRaw);
  if (!target) return false;
  if (inboundTo && target === inboundTo) {
    return true;
  }
  for (const blocked of parseExtraAiInboundKeys()) {
    if (target === blocked) return true;
  }
  return false;
}
