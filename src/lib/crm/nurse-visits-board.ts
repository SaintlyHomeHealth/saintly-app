/**
 * Filters for the nurse workspace "Visits" board (patient_visits assigned to the clinician).
 * Admin dispatch uses {@link visitNeedsAttentionOperational} separately; nurse rules are stricter here.
 */

import { type VisitNeedsAttentionInput } from "@/lib/crm/dispatch-needs-attention";

/** Max age for missed/rescheduled rows on the active board. */
export const NURSE_STALE_MISSED_RESCHEDULED_MS = 48 * 60 * 60 * 1000;

/**
 * Overdue scheduled/confirmed visits only stay in Needs attention if the overdue moment
 * (window end or point start) is within this rolling window—stops Apr 1-style stragglers.
 */
export const NURSE_OVERDUE_ATTENTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
 *
 * 1. In progress: `en_route`, `arrived` (always).
 * 2. Overdue `scheduled` / `confirmed`: only if overdue anchor is within {@link NURSE_OVERDUE_ATTENTION_MAX_AGE_MS}.
 * 3. Unscheduled `scheduled` / `confirmed`: only if `created_at` is within that same window (avoids stale rows).
 * 4. `missed` / `rescheduled`: within {@link NURSE_STALE_MISSED_RESCHEDULED_MS} (stale filtered off the board first).
 *
 * Excludes: completed/canceled, any overdue scheduled/confirmed older than 24h past due, and due-soon-not-late.
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
  if (!sf) {
    const ca = (v.created_at ?? "").trim();
    if (!ca) return false;
    const cMs = new Date(ca).getTime();
    if (!Number.isFinite(cMs)) return false;
    return nowMs - cMs <= NURSE_OVERDUE_ATTENTION_MAX_AGE_MS;
  }

  const startMs = new Date(sf).getTime();
  if (!Number.isFinite(startMs)) return false;

  const rawEnd = v.scheduled_end_at ? new Date(v.scheduled_end_at).getTime() : startMs;
  const effectiveEnd = Number.isFinite(rawEnd) ? rawEnd : startMs;
  const isTimeWindow = effectiveEnd - startMs >= WINDOW_MIN_SPAN_MS;

  const overdue = isTimeWindow ? effectiveEnd < nowMs : startMs < nowMs;
  if (!overdue) return false;

  const overdueAnchorMs = isTimeWindow ? effectiveEnd : startMs;
  return overdueAnchorMs >= nowMs - NURSE_OVERDUE_ATTENTION_MAX_AGE_MS;
}

/**
 * True when a scheduled/confirmed row should be removed from the nurse board entirely
 * (ancient overdue or stale unscheduled)—so it does not appear in any section or the hero.
 */
export function excludeAncientOverdueScheduledFromBoard(v: NurseVisitBoardInput, nowMs: number): boolean {
  const st = v.status;
  if (st !== "scheduled" && st !== "confirmed") return false;

  const sf = (v.scheduled_for ?? "").trim();
  if (!sf) {
    const ca = (v.created_at ?? "").trim();
    if (!ca) return true;
    const cMs = new Date(ca).getTime();
    if (!Number.isFinite(cMs)) return true;
    return nowMs - cMs > NURSE_OVERDUE_ATTENTION_MAX_AGE_MS;
  }

  const startMs = new Date(sf).getTime();
  if (!Number.isFinite(startMs)) return true;

  const rawEnd = v.scheduled_end_at ? new Date(v.scheduled_end_at).getTime() : startMs;
  const effectiveEnd = Number.isFinite(rawEnd) ? rawEnd : startMs;
  const isTimeWindow = effectiveEnd - startMs >= WINDOW_MIN_SPAN_MS;

  const overdue = isTimeWindow ? effectiveEnd < nowMs : startMs < nowMs;
  if (!overdue) return false;

  const overdueAnchorMs = isTimeWindow ? effectiveEnd : startMs;
  return overdueAnchorMs < nowMs - NURSE_OVERDUE_ATTENTION_MAX_AGE_MS;
}
