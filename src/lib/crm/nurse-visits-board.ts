/**
 * Filters for the nurse workspace "Visits" board (patient_visits assigned to the clinician).
 * Admin dispatch keeps its own buckets; this file only shapes the mobile nurse list.
 */

import { visitNeedsAttentionOperational, type VisitNeedsAttentionInput } from "@/lib/crm/dispatch-needs-attention";

/** Missed / rescheduled terminal rows older than this drop off the active nurse board. */
const STALE_MISSED_RESCHEDULED_MS = 5 * 24 * 60 * 60 * 1000;

export function isStaleMissedOrRescheduledNurseVisit(
  v: Pick<VisitNeedsAttentionInput, "status" | "scheduled_for"> & { created_at?: string | null },
  nowMs: number
): boolean {
  const st = v.status;
  if (st !== "missed" && st !== "rescheduled") return false;
  const anchor = (v.scheduled_for ?? "").trim() || (v.created_at ?? "").trim();
  if (!anchor) return true;
  const t = new Date(anchor).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > STALE_MISSED_RESCHEDULED_MS;
}

/**
 * Visits that should appear in "Needs attention" on the nurse board (in progress + operational triage).
 * Always surfaces en_route / arrived so they cannot disappear between buckets.
 */
export function visitNeedsNurseTriageBoard(v: VisitNeedsAttentionInput, nowMs: number): boolean {
  const st = v.status;
  if (st === "en_route" || st === "arrived") return true;
  return visitNeedsAttentionOperational(v, nowMs);
}
