/**
 * Guards for outbound “missed call” / callback SMS — must not fire when the caller was actually
 * connected to staff, AI handoff completed, or the call completed successfully.
 */

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Twilio reported the dialed PSTN/browser leg completed (typical human answer + hangup). */
function dialLegIndicatesCompleted(metadata: unknown): boolean {
  const meta = asMetadata(metadata);
  const last = meta.twilio_last_callback;
  if (!last || typeof last !== "object" || Array.isArray(last)) return false;
  const dial = String((last as Record<string, unknown>).DialCallStatus ?? "")
    .trim()
    .toLowerCase();
  return dial === "completed";
}

/**
 * True when we should never send “we missed your call” style SMS for this row.
 * Defensive: uses status, dial leg, and duration heuristics.
 */
export function shouldSuppressMissedCallStyleSms(row: {
  status?: string | null;
  direction?: string | null;
  duration_seconds?: number | null;
  metadata?: unknown;
}): boolean {
  const dir = (row.direction ?? "").trim().toLowerCase();
  if (dir !== "inbound") return true;

  const st = (row.status ?? "").trim().toLowerCase();
  if (st === "completed") return true;

  if (dialLegIndicatesCompleted(row.metadata)) return true;

  const dur =
    typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
      ? row.duration_seconds
      : 0;
  /** Long enough that the caller almost certainly spoke with someone (staff or AI bridge). */
  const threshold = 25;
  if (dur >= threshold && st !== "missed" && st !== "abandoned" && st !== "failed" && st !== "cancelled") {
    return true;
  }

  return false;
}
