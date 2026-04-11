import "server-only";

import { supabaseAdmin } from "@/lib/admin";

export type VisitPayrollLockReason = "none" | "visit_paid" | "line_submitted_or_paid";

/**
 * Nurses must not edit clock times or workflow fields once payroll has claimed the line.
 */
export async function getVisitPayrollLock(visitId: string): Promise<VisitPayrollLockReason> {
  const { data: v } = await supabaseAdmin.from("visits").select("status").eq("id", visitId).maybeSingle();
  if (v?.status === "paid") return "visit_paid";

  const { data: item } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("status, payroll_batch_id")
    .eq("visit_id", visitId)
    .maybeSingle();

  if (!item) return "none";
  if (item.payroll_batch_id != null) return "line_submitted_or_paid";
  if (item.status === "paid" || item.status === "submitted") return "line_submitted_or_paid";
  return "none";
}

export function isVisitPayrollLocked(reason: VisitPayrollLockReason): boolean {
  return reason !== "none";
}
