"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { minutesBetween } from "@/lib/payroll/pay-period";
import { recomputeEmployeeEarningsForYear } from "@/lib/payroll/recompute-earnings";
import { syncPayrollVisitItem } from "@/lib/payroll/sync-visit-item";
import { getStaffProfile, isManagerOrHigher, isPayrollApprover } from "@/lib/staff-profile";

function readId(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readOptional(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function recordVisitCompletionAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Access denied." };
  }

  const visitId = readId(formData, "visitId");
  const checkIn = readId(formData, "checkIn");
  const checkOut = readId(formData, "checkOut");
  const noteCompleted = formData.get("noteCompleted") === "on";

  if (!visitId || !checkIn || !checkOut) {
    return { ok: false as const, error: "Check-in and check-out times are required." };
  }

  const { data: visit, error: vErr } = await supabaseAdmin
    .from("visits")
    .select("id, status")
    .eq("id", visitId)
    .maybeSingle();

  if (vErr || !visit) return { ok: false as const, error: "Visit not found." };
  if (visit.status !== "pending" && visit.status !== "held") {
    return { ok: false as const, error: "Only pending or held visits can be completed." };
  }

  const serviceDate = checkOut.slice(0, 10);
  const duration = minutesBetween(checkIn, checkOut);

  const { error: uErr } = await supabaseAdmin
    .from("visits")
    .update({
      check_in_time: checkIn,
      check_out_time: checkOut,
      check_in_source: "manual",
      check_out_source: "manual",
      note_completed: noteCompleted,
      status: "completed",
      service_date: serviceDate,
      visit_duration_minutes: duration ?? null,
    })
    .eq("id", visitId);

  if (uErr) return { ok: false as const, error: uErr.message };

  try {
    await syncPayrollVisitItem(visitId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Payroll sync failed." };
  }

  revalidatePath("/admin/payroll");
  return { ok: true as const };
}

export async function createPayrollVisitAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Access denied." };
  }

  const employeeId = readId(formData, "employeeId");
  if (!employeeId) return { ok: false as const, error: "Employee is required." };

  const patientId = readId(formData, "patientId");
  const visitType = readId(formData, "visitType") ?? "visit";
  const serviceDate = readOptional(formData, "serviceDate") ?? new Date().toISOString().slice(0, 10);

  const { error } = await supabaseAdmin.from("visits").insert({
    employee_id: employeeId,
    patient_id: patientId,
    visit_type: visitType,
    status: "pending",
    service_date: serviceDate,
  });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true as const };
}

export async function holdPayrollVisitAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Access denied." };
  }

  const visitId = readId(formData, "visitId");
  const reason = readOptional(formData, "heldReason");
  if (!visitId) return { ok: false as const, error: "Missing visit." };

  const { data: visit, error: vErr } = await supabaseAdmin
    .from("visits")
    .select("id, employee_id, status, service_date")
    .eq("id", visitId)
    .maybeSingle();

  if (vErr || !visit) return { ok: false as const, error: "Visit not found." };
  if (visit.status !== "completed") {
    return { ok: false as const, error: "Only completed visits can be held." };
  }

  const { data: line } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("payroll_batch_id")
    .eq("visit_id", visitId)
    .maybeSingle();

  if (line?.payroll_batch_id) {
    return { ok: false as const, error: "Visit is already in a payroll batch." };
  }

  const { error: uErr } = await supabaseAdmin
    .from("visits")
    .update({
      status: "held",
      held_reason: reason,
      requires_review: true,
    })
    .eq("id", visitId);

  if (uErr) return { ok: false as const, error: uErr.message };

  try {
    await syncPayrollVisitItem(visitId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Payroll sync failed." };
  }

  revalidatePath("/admin/payroll");
  return { ok: true as const };
}

export async function resolvePayrollExceptionAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Access denied." };
  }

  const visitId = readId(formData, "visitId");
  if (!visitId) return { ok: false as const, error: "Missing visit." };

  try {
    await syncPayrollVisitItem(visitId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Payroll sync failed." };
  }

  revalidatePath("/admin/payroll");
  return { ok: true as const };
}

export async function markPayrollBatchPaidAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPayrollApprover(staff)) {
    return { ok: false as const, error: "Only payroll approvers can mark a batch paid." };
  }

  const batchId = readId(formData, "batchId");
  if (!batchId) return { ok: false as const, error: "Missing batch." };

  const { data: batch, error: bErr } = await supabaseAdmin
    .from("payroll_batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();

  if (bErr || !batch) return { ok: false as const, error: "Batch not found." };
  if (batch.status === "paid" || batch.status === "closed") {
    return { ok: false as const, error: "Batch already finalized." };
  }

  const { data: items, error: iErr } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("id, visit_id, employee_id")
    .eq("payroll_batch_id", batchId);

  if (iErr) return { ok: false as const, error: iErr.message };

  const now = new Date().toISOString();
  const visitIds = (items ?? []).map((i) => i.visit_id);
  const employees = [...new Set((items ?? []).map((i) => i.employee_id))];

  const { error: uItems } = await supabaseAdmin
    .from("payroll_visit_items")
    .update({ status: "paid", updated_at: now })
    .eq("payroll_batch_id", batchId);

  if (uItems) return { ok: false as const, error: uItems.message };

  if (visitIds.length > 0) {
    const { error: uVisits } = await supabaseAdmin.from("visits").update({ status: "paid" }).in("id", visitIds);
    if (uVisits) return { ok: false as const, error: uVisits.message };
  }

  const { error: uBatch } = await supabaseAdmin
    .from("payroll_batches")
    .update({
      status: "paid",
      paid_at: now,
      export_status: "exported",
      updated_at: now,
    })
    .eq("id", batchId);

  if (uBatch) return { ok: false as const, error: uBatch.message };

  const years = new Set<number>();
  const { data: visitRows } = await supabaseAdmin.from("visits").select("employee_id, service_date").in("id", visitIds);
  for (const v of visitRows ?? []) {
    const sd = typeof v.service_date === "string" ? v.service_date : null;
    if (sd) years.add(Number(sd.slice(0, 4)));
  }

  const yearList = years.size > 0 ? [...years] : [new Date().getFullYear()];

  try {
    for (const emp of employees) {
      for (const y of yearList) {
        await recomputeEmployeeEarningsForYear(emp, y);
      }
    }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Earnings update failed." };
  }

  revalidatePath("/admin/payroll");
  revalidatePath("/workspace/pay");
  return { ok: true as const };
}

export async function setBatchExportStubAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPayrollApprover(staff)) {
    return { ok: false as const, error: "Access denied." };
  }

  const batchId = readId(formData, "batchId");
  const externalProvider = readOptional(formData, "externalProvider") ?? "quickbooks";
  const externalBatchId = readOptional(formData, "externalBatchId");
  if (!batchId) return { ok: false as const, error: "Missing batch." };

  const { error } = await supabaseAdmin
    .from("payroll_batches")
    .update({
      external_provider: externalProvider,
      external_batch_id: externalBatchId,
      export_status: "exported",
      exported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true as const };
}
