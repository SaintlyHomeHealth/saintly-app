export type PayrollVisitLike = {
  check_in_time: string | null;
  check_out_time: string | null;
  note_completed: boolean;
  status: string;
  requires_review?: boolean | null;
};

/**
 * Human-readable compliance / exception flags for admin review.
 */
export function payrollComplianceFlags(v: PayrollVisitLike): string[] {
  const flags: string[] = [];
  if (!v.check_in_time) flags.push("Missing check-in");
  if (!v.check_out_time) flags.push("Missing check-out");
  if (!v.note_completed) flags.push("Note not completed");
  if (v.status === "held") flags.push("On hold");
  if (v.status === "pending") flags.push("Visit not completed");
  if (v.requires_review) flags.push("Needs review");
  return flags;
}

/**
 * True when the visit has a payroll line ready for the weekly batch (not void, not paid).
 */
export function isVisitPayrollReady(hasReadyItem: boolean, itemVoid: boolean): boolean {
  return hasReadyItem && !itemVoid;
}
