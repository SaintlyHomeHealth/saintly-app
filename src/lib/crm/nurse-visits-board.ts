/**
 * Filters for the nurse workspace "Visits" board (patient_visits assigned to the clinician).
 * Admin dispatch uses {@link visitNeedsAttentionOperational} separately; nurse rules are stricter here.
 */

import { type VisitNeedsAttentionInput } from "@/lib/crm/dispatch-needs-attention";

/** Max age for missed/rescheduled rows on the active board (outer bound of 24–48h). */
export const NURSE_STALE_MISSED_RESCHEDULED_MS = 48 * 60 * 60 * 1000;

export type NurseVisitBoardInput = VisitNeedsAttentionInput & {
  created_at?: string | null;
};

const PRE_ENROUTE_VISIT = new Set(["scheduled", "confirmed"]);
/** Align with dispatch-needs-attention window check. */
const WINDOW_MIN_SPAN_MS = 60 * 1000;

/**
 * True when a missed/rescheduled row should be removed from the active nurse list.
 * Uses scheduled_for, else created_at.
 */
export function isStaleMissedOrRescheduledNurseVisit(
  v: Pick<NurseVisitBoardInput, "status" | "scheduled_for" | "created_at">,
  nowMs: number
): boolean {
  const st = v.status;
  if (st !== "missed" && st !== "rescheduled") return false;
  const anchor = (v.scheduled_for ?? "").trim() || (v.created_at ?? "").trim();
  if (!anchor) return true;
  const t = new Date(anchor).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > NURSE_STALE_MISSED_RESCHEDULED_MS;
}

/**
 * Strict nurse "Needs attention" bucket only:
 * - in progress: en_route, arrived
 * - overdue scheduled/confirmed (window ended, or point-in-time start in the past), or missing schedule time
 * - missed / rescheduled still within {@link NURSE_STALE_MISSED_RESCHEDULED_MS} (stale rows should be removed before calling)
 *
 * Excludes: completed/canceled (not on this query), due-soon-but-not-yet-late hype, and old missed/rescheduled (drop via stale filter first).
 */
export function visitNeedsNurseAttentionStrict(v: NurseVisitBoardInput, nowMs: number): boolean {
  const st = v.status;

  if (st === "completed" || st === "canceled") return false;

  if (st === "en_route" || st === "arrived") return true;

  if (st === "missed" || st === "rescheduled") {
    return !isStaleMissedOrRescheduledNurseVisit(
      { status: st, scheduled_for: v.scheduled_for, created_at: v.created_at ?? null },
      nowMs
    );
  }

  if (!PRE_ENROUTE_VISIT.has(st)) return false;

  const sf = (v.scheduled_for ?? "").trim();
  if (!sf) return true;

  const startMs = new Date(sf).getTime();
  if (!Number.isFinite(startMs)) return false;

  const rawEnd = v.scheduled_end_at ? new Date(v.scheduled_end_at).getTime() : startMs;
  const effectiveEnd = Number.isFinite(rawEnd) ? rawEnd : startMs;
  const isTimeWindow = effectiveEnd - startMs >= WINDOW_MIN_SPAN_MS;

  if (isTimeWindow) {
    return effectiveEnd < nowMs;
  }
  return startMs < nowMs;
}
