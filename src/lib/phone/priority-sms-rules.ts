import type { SupabaseClient } from "@supabase/supabase-js";

/** Stored on phone_calls.priority_sms_reason and in SMS copy. */
export type PrioritySmsReasonCode = "voicemail_left" | "repeat_caller_15m" | "missed_long_call";

const BLOCKED_CALLER_TOKENS = new Set([
  "anonymous",
  "restricted",
  "unknown",
  "private",
  "unavailable",
  "withheld",
]);

const REPEAT_WINDOW_MS = 15 * 60 * 1000;
const MISSED_LONG_MIN_DURATION_SECONDS = 12;

export function isValidCallerIdForPriority(fromE164: string | null | undefined): boolean {
  const raw = (fromE164 ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (BLOCKED_CALLER_TOKENS.has(lower)) return false;
  // E.164: + then 1–15 digits (Twilio inbound From is typically E.164).
  if (!/^\+[1-9]\d{1,14}$/.test(raw)) return false;
  return true;
}

function reasonToSmsLabel(code: PrioritySmsReasonCode): string {
  switch (code) {
    case "voicemail_left":
      return "voicemail";
    case "repeat_caller_15m":
      return "repeat caller";
    case "missed_long_call":
      return "long ring (no pickup)";
    default:
      return "priority";
  }
}

export function formatPrioritySmsBody(
  fromE164: string | null | undefined,
  reason: PrioritySmsReasonCode
): string {
  const from = (fromE164 ?? "").trim() || "unknown";
  const label = reasonToSmsLabel(reason);
  if (reason === "voicemail_left") {
    return `Saintly priority alert: voicemail from ${from}. Reason: ${label}. Check admin.`;
  }
  return `Saintly priority alert: missed call from ${from}. Reason: ${label}. Check admin.`;
}

export async function countInboundCallsFromNumberLast15Minutes(
  supabase: SupabaseClient,
  fromE164: string
): Promise<number> {
  const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("phone_calls")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("from_e164", fromE164)
    .gte("created_at", since);

  if (error) {
    console.warn("[priority-sms-rules] countInboundCallsFromNumberLast15Minutes:", error.message);
    return 0;
  }
  return count ?? 0;
}

export type MissedPathPriorityContext = {
  terminalStatus: string;
  fromE164: string | null | undefined;
  effectiveDurationSeconds: number | null | undefined;
};

/**
 * Phase-1 missed-call path: repeat caller (2+ inbound from same E.164 in 15m) or missed + long ring (>12s).
 * Voicemail path uses voicemail_left separately.
 */
export async function resolveMissedPathPriorityReason(
  supabase: SupabaseClient,
  ctx: MissedPathPriorityContext
): Promise<PrioritySmsReasonCode | null> {
  const st = (ctx.terminalStatus ?? "").trim().toLowerCase();
  if (st === "abandoned") return null;

  const from = (ctx.fromE164 ?? "").trim();
  if (!isValidCallerIdForPriority(from)) return null;

  const repeatCount = await countInboundCallsFromNumberLast15Minutes(supabase, from);
  if (repeatCount >= 2) {
    return "repeat_caller_15m";
  }

  if (st === "missed") {
    const d = ctx.effectiveDurationSeconds;
    if (d != null && Number.isFinite(d) && d > MISSED_LONG_MIN_DURATION_SECONDS) {
      return "missed_long_call";
    }
  }

  return null;
}
