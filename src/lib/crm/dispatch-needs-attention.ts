/**
 * Shared "needs attention" rules for dispatch / workspace Visits (operational triage).
 * Keep logic minimal and aligned with admin dispatch buckets.
 */

const ACTIVE_PRE_ENROUTE = new Set(["scheduled", "confirmed"]);

const ONE_HOUR_MS = 60 * 60 * 1000;
/** Treat as a time window (not a point visit) when end is meaningfully after start. */
const WINDOW_MIN_SPAN_MS = 60 * 1000;

export type VisitNeedsAttentionInput = {
  status: string;
  assigned_user_id?: string | null;
  scheduled_for?: string | null;
  scheduled_end_at?: string | null;
};

/**
 * True when the visit should surface in a "Needs attention" / triage bucket.
 */
export function visitNeedsAttentionOperational(v: VisitNeedsAttentionInput, nowMs: number): boolean {
  const st = v.status;
  if (st === "missed" || st === "rescheduled") return true;

  const sf = v.scheduled_for;
  if (!sf || sf.trim() === "") {
    if (ACTIVE_PRE_ENROUTE.has(st)) return true;
    return false;
  }

  const startMs = new Date(sf).getTime();
  if (!Number.isFinite(startMs)) return false;

  const rawEnd = v.scheduled_end_at ? new Date(v.scheduled_end_at).getTime() : startMs;
  const effectiveEnd = Number.isFinite(rawEnd) ? rawEnd : startMs;
  const isTimeWindow = effectiveEnd - startMs >= WINDOW_MIN_SPAN_MS;

  if (ACTIVE_PRE_ENROUTE.has(st)) {
    if (effectiveEnd < nowMs) return true;
    if (!isTimeWindow && startMs > nowMs && startMs <= nowMs + ONE_HOUR_MS) return true;
  }

  return false;
}

export function visitOnTrackForTodayQueue(v: VisitNeedsAttentionInput, nowMs: number): boolean {
  return !visitNeedsAttentionOperational(v, nowMs);
}
