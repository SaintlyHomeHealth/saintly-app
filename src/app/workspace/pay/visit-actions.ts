"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { nurseMayUsePatient } from "@/lib/payroll/nurse-assignable-patients";
import { minutesBetween } from "@/lib/payroll/pay-period";
import { syncPayrollVisitItem } from "@/lib/payroll/sync-visit-item";
import { getVisitPayrollLock, isVisitPayrollLocked } from "@/lib/payroll/visit-lock";
import { getStaffProfile } from "@/lib/staff-profile";

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function assertOwnVisit(visitId: string, applicantId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: v, error } = await supabaseAdmin.from("visits").select("id, employee_id").eq("id", visitId).maybeSingle();
  if (error || !v) return { ok: false, error: "Visit not found." };
  if (v.employee_id !== applicantId) return { ok: false, error: "This visit is not yours." };
  return { ok: true };
}

async function findActiveVisitId(applicantId: string): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from("visits")
    .select("id")
    .eq("employee_id", applicantId)
    .eq("status", "pending")
    .not("check_in_time", "is", null)
    .is("check_out_time", null)
    .order("check_in_time", { ascending: false })
    .limit(1);

  const id = rows?.[0] && typeof rows[0].id === "string" ? rows[0].id : "";
  return id || null;
}

export async function startVisitAction(input: {
  patientId: string;
  visitType?: string;
  checkInLat?: number | null;
  checkInLng?: number | null;
}): Promise<{ ok: true; visitId: string } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet." };
  }
  const applicantId = staff.applicant_id;
  const userId = staff.user_id;

  const patientId = typeof input.patientId === "string" ? input.patientId.trim() : "";
  if (!patientId) return { ok: false, error: "Choose a patient." };

  const allowed = await nurseMayUsePatient(userId, patientId);
  if (!allowed) return { ok: false, error: "You are not assigned to this patient." };

  const existing = await findActiveVisitId(applicantId);
  if (existing) {
    return { ok: false, error: "You already have a visit in progress. End it before starting another." };
  }

  const now = new Date().toISOString();
  const visitType = (input.visitType ?? "visit").trim() || "visit";
  const lat = typeof input.checkInLat === "number" && Number.isFinite(input.checkInLat) ? input.checkInLat : null;
  const lng = typeof input.checkInLng === "number" && Number.isFinite(input.checkInLng) ? input.checkInLng : null;

  const { data: created, error } = await supabaseAdmin
    .from("visits")
    .insert({
      employee_id: applicantId,
      patient_id: patientId,
      visit_type: visitType,
      status: "pending",
      check_in_time: now,
      check_in_source: "workspace_pay",
      service_date: localIsoDate(new Date()),
      check_in_lat: lat,
      check_in_lng: lng,
    })
    .select("id")
    .maybeSingle();

  if (error || !created?.id) {
    return { ok: false, error: error?.message ?? "Could not start visit." };
  }

  try {
    await syncPayrollVisitItem(String(created.id));
  } catch {
    // sync may no-op for pending — ignore
  }

  revalidatePath("/workspace/pay");
  return { ok: true, visitId: String(created.id) };
}

export async function endVisitAction(input: {
  visitId: string;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet." };
  }
  const applicantId = staff.applicant_id;
  const visitId = typeof input.visitId === "string" ? input.visitId.trim() : "";
  if (!visitId) return { ok: false, error: "Missing visit." };

  const own = await assertOwnVisit(visitId, applicantId);
  if (!own.ok) return own;

  const lock = await getVisitPayrollLock(visitId);
  if (isVisitPayrollLocked(lock)) {
    return { ok: false, error: "This visit is locked after payroll submission. Contact the office if something is wrong." };
  }

  const { data: v, error: vErr } = await supabaseAdmin
    .from("visits")
    .select("id, check_in_time, check_out_time, status, service_date")
    .eq("id", visitId)
    .maybeSingle();

  if (vErr || !v) return { ok: false, error: "Visit not found." };
  if (v.status === "held") return { ok: false, error: "This visit is on hold by the office." };
  if (v.status === "paid") return { ok: false, error: "This visit is already paid." };
  if (!v.check_in_time) return { ok: false, error: "This visit has no check-in time." };
  if (v.check_out_time) return { ok: false, error: "This visit is already ended." };

  const now = new Date().toISOString();
  const mins = minutesBetween(v.check_in_time, now);
  const duration = mins != null && mins >= 0 ? mins : null;

  const lat = typeof input.checkOutLat === "number" && Number.isFinite(input.checkOutLat) ? input.checkOutLat : null;
  const lng = typeof input.checkOutLng === "number" && Number.isFinite(input.checkOutLng) ? input.checkOutLng : null;

  const serviceDate =
    typeof v.service_date === "string" && v.service_date.trim() !== ""
      ? v.service_date
      : localIsoDate(new Date());

  const { error: uErr } = await supabaseAdmin
    .from("visits")
    .update({
      check_out_time: now,
      check_out_source: "workspace_pay",
      visit_duration_minutes: duration,
      service_date: serviceDate,
      status: "completed",
      check_out_lat: lat,
      check_out_lng: lng,
      updated_at: now,
    })
    .eq("id", visitId);

  if (uErr) return { ok: false, error: uErr.message };

  try {
    await syncPayrollVisitItem(visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Visit ended but payroll sync failed. Contact the office." };
  }

  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function requestOfficeReviewAction(visitId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet." };
  }
  const id = typeof visitId === "string" ? visitId.trim() : "";
  if (!id) return { ok: false, error: "Missing visit." };

  const own = await assertOwnVisit(id, staff.applicant_id);
  if (!own.ok) return own;

  const lock = await getVisitPayrollLock(id);
  if (isVisitPayrollLocked(lock)) {
    return { ok: false, error: "This visit is already in payroll. Contact the office by phone." };
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("visits").update({ requires_review: true, updated_at: now }).eq("id", id);

  if (error) return { ok: false, error: error.message };

  try {
    await syncPayrollVisitItem(id);
  } catch {
    // best-effort
  }

  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function refreshVisitPayrollAction(visitId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet." };
  }
  const id = typeof visitId === "string" ? visitId.trim() : "";
  if (!id) return { ok: false, error: "Missing visit." };

  const own = await assertOwnVisit(id, staff.applicant_id);
  if (!own.ok) return own;

  try {
    await syncPayrollVisitItem(id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }

  revalidatePath("/workspace/pay");
  return { ok: true };
}
