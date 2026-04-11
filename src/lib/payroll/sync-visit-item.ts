import { supabaseAdmin } from "@/lib/admin";
import { computeVisitGrossPay, visitWorkedHours } from "@/lib/payroll/compute-payable";
import { loadContractForServiceDate } from "@/lib/payroll/contract-for-date";
import { earningsYearFromServiceDate, recomputeEmployeeEarningsForYear } from "@/lib/payroll/recompute-earnings";

/**
 * Creates/updates the immutable payroll line for a visit, or voids it when ineligible.
 * Call after visit completion, hold, or exception resolution.
 */
export async function syncPayrollVisitItem(visitId: string): Promise<void> {
  const { data: visit, error: vErr } = await supabaseAdmin
    .from("visits")
    .select(
      "id, employee_id, status, service_date, check_in_time, check_out_time, note_completed, requires_review"
    )
    .eq("id", visitId)
    .maybeSingle();

  if (vErr || !visit) throw new Error(vErr?.message ?? "Visit not found");

  const { data: existing } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("id, status, payroll_batch_id")
    .eq("visit_id", visitId)
    .maybeSingle();

  if (existing?.status === "paid" || existing?.payroll_batch_id) {
    return;
  }

  const serviceDate =
    typeof visit.service_date === "string" ? visit.service_date : null;
  if (!serviceDate) {
    await supabaseAdmin.from("visits").update({ requires_review: true }).eq("id", visitId);
    return;
  }

  const year = earningsYearFromServiceDate(serviceDate);

  const voidAndRecompute = async () => {
    if (existing?.id) {
      await supabaseAdmin
        .from("payroll_visit_items")
        .update({
          status: "void",
          gross_amount: 0,
          employment_classification_snapshot: "employee",
          pay_type_snapshot: "per_visit",
          pay_rate_snapshot: 0,
          hours_snapshot: null,
          payout_route: "w2",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    await recomputeEmployeeEarningsForYear(visit.employee_id, year);
  };

  if (visit.status === "held" || visit.status === "pending") {
    await voidAndRecompute();
    return;
  }

  if (visit.status === "paid") {
    return;
  }

  if (visit.status !== "completed") {
    await voidAndRecompute();
    return;
  }

  if (!visit.check_in_time || !visit.check_out_time || !visit.note_completed) {
    await supabaseAdmin.from("visits").update({ requires_review: true }).eq("id", visitId);
    await voidAndRecompute();
    return;
  }

  const contract = await loadContractForServiceDate(visit.employee_id, serviceDate);
  if (!contract) {
    await supabaseAdmin.from("visits").update({ requires_review: true }).eq("id", visitId);
    await voidAndRecompute();
    return;
  }

  const hours = visitWorkedHours(visit.check_in_time, visit.check_out_time);
  const gross = computeVisitGrossPay(
    {
      pay_type: contract.pay_type,
      pay_rate: contract.pay_rate,
      contract_status: contract.contract_status,
    },
    visit.check_in_time,
    visit.check_out_time
  );

  const payoutRoute = contract.employment_classification === "employee" ? "w2" : "contractor_1099";

  await supabaseAdmin.from("payroll_visit_items").upsert(
    {
      visit_id: visitId,
      employee_id: visit.employee_id,
      contract_id: contract.id,
      employment_classification_snapshot: contract.employment_classification,
      pay_type_snapshot: contract.pay_type,
      pay_rate_snapshot: contract.pay_rate,
      hours_snapshot: hours,
      gross_amount: gross,
      status: "ready",
      payout_route: payoutRoute,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "visit_id" }
  );

  await supabaseAdmin.from("visits").update({ requires_review: false }).eq("id", visitId);
  await recomputeEmployeeEarningsForYear(visit.employee_id, year);
}

export async function recomputeEarningsForVisitEmployee(visitId: string): Promise<void> {
  const { data: visit } = await supabaseAdmin
    .from("visits")
    .select("employee_id, service_date")
    .eq("id", visitId)
    .maybeSingle();
  if (!visit?.employee_id || !visit.service_date) return;
  await recomputeEmployeeEarningsForYear(visit.employee_id, earningsYearFromServiceDate(visit.service_date));
}
