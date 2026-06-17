/**
 * Pure filtering + dashboard-count helpers for PT/PTA cold-call saved records.
 * Shared by the list API and any server rendering so buckets stay consistent.
 */

import { PT_COLD_CALL_DORMANT_STATUSES, type PtColdCallFilterId } from "@/lib/recruiting/pt-cold-call-options";
import type { PtColdCallDashboardCounts, PtColdCallTargetRow } from "@/lib/recruiting/pt-cold-call-types";

function isDormant(t: Pick<PtColdCallTargetRow, "status" | "do_not_call">): boolean {
  return t.do_not_call || PT_COLD_CALL_DORMANT_STATUSES.includes(t.status);
}

function followUpDueBy(t: Pick<PtColdCallTargetRow, "next_follow_up_at">, cutoffIso: string): boolean {
  if (!t.next_follow_up_at) return false;
  const due = Date.parse(t.next_follow_up_at);
  const cutoff = Date.parse(cutoffIso);
  if (!Number.isFinite(due) || !Number.isFinite(cutoff)) return false;
  return due <= cutoff;
}

/**
 * Whether a target belongs in a given filter bucket.
 * `cutoffIso` is the end-of-today cutoff (Phoenix) for follow-up due logic.
 */
export function ptColdCallMatchesFilter(
  t: Pick<
    PtColdCallTargetRow,
    "status" | "do_not_call" | "next_follow_up_at" | "call_attempts"
  >,
  filterId: PtColdCallFilterId,
  cutoffIso: string
): boolean {
  const dormant = isDormant(t);
  const due = followUpDueBy(t, cutoffIso);

  switch (filterId) {
    case "all":
      return true;
    case "call_today":
      return !dormant && (t.status === "Call Today" || due);
    case "follow_up_due":
      return !dormant && due;
    case "new":
      return t.status === "New" && t.call_attempts === 0;
    case "interested":
      return t.status === "Interested";
    case "candidate":
      return t.status === "Candidate Identified";
    case "do_not_call":
      return t.do_not_call || t.status === "Do Not Call";
    case "bad_number":
      return t.status === "Bad Number";
    case "not_interested":
      return t.status === "Not Interested";
    default:
      return true;
  }
}

export function computePtColdCallCounts(
  targets: Pick<
    PtColdCallTargetRow,
    "status" | "do_not_call" | "next_follow_up_at" | "call_attempts"
  >[],
  cutoffIso: string
): PtColdCallDashboardCounts {
  const counts: PtColdCallDashboardCounts = {
    new: 0,
    call_today: 0,
    follow_up_due: 0,
    interested: 0,
    candidate: 0,
    do_not_call: 0,
    bad_number: 0,
    not_interested: 0,
    all: targets.length,
  };

  for (const t of targets) {
    if (ptColdCallMatchesFilter(t, "new", cutoffIso)) counts.new += 1;
    if (ptColdCallMatchesFilter(t, "call_today", cutoffIso)) counts.call_today += 1;
    if (ptColdCallMatchesFilter(t, "follow_up_due", cutoffIso)) counts.follow_up_due += 1;
    if (ptColdCallMatchesFilter(t, "interested", cutoffIso)) counts.interested += 1;
    if (ptColdCallMatchesFilter(t, "candidate", cutoffIso)) counts.candidate += 1;
    if (ptColdCallMatchesFilter(t, "do_not_call", cutoffIso)) counts.do_not_call += 1;
    if (ptColdCallMatchesFilter(t, "bad_number", cutoffIso)) counts.bad_number += 1;
    if (ptColdCallMatchesFilter(t, "not_interested", cutoffIso)) counts.not_interested += 1;
  }

  return counts;
}
