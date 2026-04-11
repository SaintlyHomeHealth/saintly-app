"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { getOrCreatePayrollBatchForPeriod } from "@/lib/payroll/get-or-create-batch";
import { getPayPeriodForDate, serviceDateInPeriod } from "@/lib/payroll/pay-period";
import { getStaffProfile } from "@/lib/staff-profile";

export async function refreshPayrollDashboardAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    revalidatePath("/workspace/pay");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not refresh." };
  }
}

export async function submitWeeklyPayrollAction() {
  const staff = await getStaffProfile();
  if (!staff) {
    return { ok: false as const, error: "Not signed in." };
  }

  const applicantId = staff.applicant_id;
  if (!applicantId) {
    return { ok: false as const, error: "Your profile is not linked to payroll yet. Contact HR." };
  }

  const bounds = getPayPeriodForDate(new Date());
  const deadline = new Date(bounds.submissionDeadline);
  if (Date.now() > deadline.getTime()) {
    return {
      ok: false as const,
      error: "The submission deadline for this pay period has passed. Contact payroll if you need help.",
    };
  }

  let batch;
  try {
    batch = await getOrCreatePayrollBatchForPeriod(bounds);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not open payroll batch." };
  }

  const { data: rows, error: qErr } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("id, visit_id")
    .eq("employee_id", applicantId)
    .eq("status", "ready")
    .is("payroll_batch_id", null);

  if (qErr) return { ok: false as const, error: qErr.message };

  const visitIds = [...new Set((rows ?? []).map((r) => r.visit_id))];
  if (visitIds.length === 0) {
    return { ok: false as const, error: "No eligible visits to submit for this pay period." };
  }

  const { data: visits, error: vErr } = await supabaseAdmin
    .from("visits")
    .select("id, service_date")
    .in("id", visitIds);

  if (vErr) return { ok: false as const, error: vErr.message };

  const inPeriod = new Set(
    (visits ?? [])
      .filter((v) => {
        const sd = typeof v.service_date === "string" ? v.service_date : null;
        return sd && serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd);
      })
      .map((v) => v.id)
  );

  const toSubmit = (rows ?? []).filter((r) => inPeriod.has(r.visit_id));
  if (toSubmit.length === 0) {
    return { ok: false as const, error: "No eligible visits to submit for this pay period." };
  }

  const ids = toSubmit.map((r) => r.id);
  const now = new Date().toISOString();

  const { error: uErr } = await supabaseAdmin
    .from("payroll_visit_items")
    .update({
      payroll_batch_id: batch.id,
      status: "submitted",
      updated_at: now,
    })
    .in("id", ids);

  if (uErr) return { ok: false as const, error: uErr.message };

  const { error: bErr } = await supabaseAdmin
    .from("payroll_batches")
    .update({ status: "submitted", updated_at: now })
    .eq("id", batch.id)
    .eq("status", "open");

  if (bErr) return { ok: false as const, error: bErr.message };

  revalidatePath("/workspace/pay");
  revalidatePath("/admin/payroll");
  return { ok: true as const };
}
