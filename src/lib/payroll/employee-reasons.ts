import type { PayrollVisitLike } from "@/lib/payroll/compliance";

export type VisitReasonContext = {
  /** When false, visit service date is outside the current Mon–Sun pay window. */
  inCurrentPeriod: boolean;
  /** True when no signed contract covers the visit service date (payroll cannot compute pay). */
  contractMissing: boolean;
};

/**
 * Clear, employee-facing labels for payroll / visit issues (workspace pay dashboard).
 */
export function getEmployeePayrollReasons(
  v: PayrollVisitLike & {
    service_date?: string | null;
    status: string;
    held_reason?: string | null;
  },
  ctx: VisitReasonContext
): string[] {
  const reasons: string[] = [];

  if (!ctx.inCurrentPeriod) {
    reasons.push("Outside pay period");
  }

  if (v.status === "held") {
    reasons.push("Held by admin");
  }

  if (v.status === "pending") {
    reasons.push("Visit not completed");
  }

  const sd = typeof v.service_date === "string" ? v.service_date : null;
  if (!sd) {
    reasons.push("Needs office review");
  }

  if (!v.check_in_time) {
    reasons.push("Missing check-in");
  }
  if (!v.check_out_time) {
    reasons.push("Missing check-out");
  }
  if (!v.note_completed) {
    reasons.push("Missing note");
  }

  const complianceOk =
    v.status === "completed" &&
    !!v.check_in_time &&
    !!v.check_out_time &&
    !!v.note_completed &&
    !!sd;

  if (complianceOk && ctx.contractMissing) {
    reasons.push("Contract missing");
  }

  if (v.requires_review) {
    const specific = reasons.some((r) =>
      [
        "Contract missing",
        "Missing check-in",
        "Missing check-out",
        "Missing note",
        "Outside pay period",
        "Held by admin",
        "Visit not completed",
        "Needs office review",
      ].includes(r)
    );
    if (!specific) {
      reasons.push("Needs office review");
    }
  }

  return [...new Set(reasons)];
}

export function checkInOutSummary(v: PayrollVisitLike): string {
  if (v.check_in_time && v.check_out_time) return "Check-in & check-out recorded";
  if (v.check_in_time && !v.check_out_time) return "Check-in recorded · check-out missing";
  if (!v.check_in_time && v.check_out_time) return "Check-in missing · check-out recorded";
  return "Check-in & check-out missing";
}

export function noteSummary(noteCompleted: boolean): string {
  return noteCompleted ? "Note completed" : "Missing note";
}
