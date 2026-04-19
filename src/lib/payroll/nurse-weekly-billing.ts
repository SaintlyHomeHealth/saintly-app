import "server-only";

import { supabaseAdmin } from "@/lib/admin";

import type { PayPeriodBounds } from "./pay-period";

export type NurseWeeklyBillingRow = {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: "draft" | "submitted" | "paid";
  submitted_at: string | null;
  paid_at: string | null;
};

/**
 * Ensures a draft-capable weekly billing row exists for this employee and pay period.
 */
export async function ensureNurseWeeklyBilling(
  applicantId: string,
  bounds: PayPeriodBounds
): Promise<NurseWeeklyBillingRow> {
  const { data: existing, error: qErr } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select("id, employee_id, pay_period_start, pay_period_end, status, submitted_at, paid_at")
    .eq("employee_id", applicantId)
    .eq("pay_period_start", bounds.payPeriodStart)
    .maybeSingle();

  if (qErr) throw new Error(qErr.message);

  if (existing && typeof existing.id === "string") {
    return existing as NurseWeeklyBillingRow;
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .insert({
      employee_id: applicantId,
      pay_period_start: bounds.payPeriodStart,
      pay_period_end: bounds.payPeriodEnd,
      status: "draft",
    })
    .select("id, employee_id, pay_period_start, pay_period_end, status, submitted_at, paid_at")
    .single();

  if (insErr || !created) throw new Error(insErr?.message ?? "Could not create weekly billing.");

  return created as NurseWeeklyBillingRow;
}
