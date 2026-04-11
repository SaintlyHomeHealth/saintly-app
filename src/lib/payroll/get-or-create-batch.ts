import { supabaseAdmin } from "@/lib/admin";
import type { PayPeriodBounds } from "@/lib/payroll/pay-period";

/**
 * One batch per Mon–Sun period (unique constraint).
 */
export async function getOrCreatePayrollBatchForPeriod(bounds: PayPeriodBounds) {
  const { data: existing } = await supabaseAdmin
    .from("payroll_batches")
    .select("id, status, submission_deadline, pay_date, pay_period_start, pay_period_end")
    .eq("pay_period_start", bounds.payPeriodStart)
    .eq("pay_period_end", bounds.payPeriodEnd)
    .maybeSingle();

  if (existing?.id) return existing;

  const { data: created, error } = await supabaseAdmin
    .from("payroll_batches")
    .insert({
      pay_period_start: bounds.payPeriodStart,
      pay_period_end: bounds.payPeriodEnd,
      submission_deadline: bounds.submissionDeadline,
      pay_date: bounds.payDate,
      status: "open",
      export_status: "pending",
    })
    .select("id, status, submission_deadline, pay_date, pay_period_start, pay_period_end")
    .single();

  if (!error && created) return created;

  if (error?.code === "23505") {
    const { data: again } = await supabaseAdmin
      .from("payroll_batches")
      .select("id, status, submission_deadline, pay_date, pay_period_start, pay_period_end")
      .eq("pay_period_start", bounds.payPeriodStart)
      .eq("pay_period_end", bounds.payPeriodEnd)
      .maybeSingle();
    if (again?.id) return again;
  }

  throw new Error(error?.message ?? "Could not create payroll batch.");
}
