"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { nurseMayUsePatient } from "@/lib/payroll/nurse-assignable-patients";
import { ensureNurseWeeklyBilling } from "@/lib/payroll/nurse-weekly-billing";
import { getPayPeriodForDate, serviceDateInPeriod } from "@/lib/payroll/pay-period";
import { getStaffProfile } from "@/lib/staff-profile";

import type { BillingLineType } from "./self-billing-types";

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

async function loadOwnBillingRow(billingId: string, applicantId: string) {
  const { data, error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select("id, employee_id, status, pay_period_start, pay_period_end")
    .eq("id", billingId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.employee_id !== applicantId) return null;
  return data as {
    id: string;
    employee_id: string;
    status: string;
    pay_period_start: string;
    pay_period_end: string;
  };
}

export async function addSelfBillingLineAction(input: {
  patientId: string;
  serviceDate: string;
  lineType: BillingLineType;
  amount: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet. Contact HR." };
  }
  const applicantId = staff.applicant_id;
  const bounds = getPayPeriodForDate(new Date());

  const okPatient = await nurseMayUsePatient(staff.user_id, input.patientId);
  if (!okPatient) return { ok: false, error: "That patient is not available for your assignments." };

  const sd = input.serviceDate.trim();
  if (!sd || !serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd)) {
    return { ok: false, error: "Service date must fall within this pay week." };
  }

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: "Enter a valid amount (0 or greater)." };

  let billing;
  try {
    billing = await ensureNurseWeeklyBilling(applicantId, bounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open weekly billing." };
  }

  if (billing.status !== "draft") {
    return { ok: false, error: "This week is already submitted. You cannot add lines." };
  }

  const notesTrim = input.notes.trim();
  const { error } = await supabaseAdmin.from("nurse_weekly_billing_lines").insert({
    billing_id: billing.id,
    patient_id: input.patientId,
    service_date: sd,
    line_type: input.lineType,
    amount,
    notes: notesTrim.length ? notesTrim : null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function updateSelfBillingLineAction(input: {
  billingId: string;
  lineId: string;
  patientId: string;
  serviceDate: string;
  lineType: BillingLineType;
  amount: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet. Contact HR." };
  }

  const row = await loadOwnBillingRow(input.billingId, staff.applicant_id);
  if (!row || row.status !== "draft") {
    return { ok: false, error: "You can only edit lines while this week is in draft." };
  }

  const okPatient = await nurseMayUsePatient(staff.user_id, input.patientId);
  if (!okPatient) return { ok: false, error: "That patient is not available for your assignments." };

  const sd = input.serviceDate.trim();
  if (!sd || !serviceDateInPeriod(sd, row.pay_period_start, row.pay_period_end)) {
    return { ok: false, error: "Service date must fall within this pay week." };
  }

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: "Enter a valid amount (0 or greater)." };

  const { data: line, error: lineErr } = await supabaseAdmin
    .from("nurse_weekly_billing_lines")
    .select("id, billing_id")
    .eq("id", input.lineId)
    .maybeSingle();

  if (lineErr || !line || line.billing_id !== input.billingId) {
    return { ok: false, error: "Line not found." };
  }

  const notesTrim = input.notes.trim();
  const { error } = await supabaseAdmin
    .from("nurse_weekly_billing_lines")
    .update({
      patient_id: input.patientId,
      service_date: sd,
      line_type: input.lineType,
      amount,
      notes: notesTrim.length ? notesTrim : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.lineId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function deleteSelfBillingLineAction(input: {
  billingId: string;
  lineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet. Contact HR." };
  }

  const row = await loadOwnBillingRow(input.billingId, staff.applicant_id);
  if (!row || row.status !== "draft") {
    return { ok: false, error: "You can only delete lines while this week is in draft." };
  }

  const { data: line, error: lineErr } = await supabaseAdmin
    .from("nurse_weekly_billing_lines")
    .select("id, billing_id")
    .eq("id", input.lineId)
    .maybeSingle();

  if (lineErr || !line || line.billing_id !== input.billingId) {
    return { ok: false, error: "Line not found." };
  }

  const { error } = await supabaseAdmin.from("nurse_weekly_billing_lines").delete().eq("id", input.lineId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function submitSelfBillingWeekAction(
  billingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet. Contact HR." };
  }

  const row = await loadOwnBillingRow(billingId, staff.applicant_id);
  if (!row || row.status !== "draft") {
    return { ok: false, error: "This week is not in draft or could not be loaded." };
  }

  const bounds = getPayPeriodForDate(new Date());
  if (row.pay_period_start !== bounds.payPeriodStart) {
    return { ok: false, error: "This billing is not for the current pay week." };
  }

  const deadline = new Date(bounds.submissionDeadline);
  if (Date.now() > deadline.getTime()) {
    return {
      ok: false,
      error: "The submission deadline for this pay period has passed. Contact payroll if you need help.",
    };
  }

  const { count, error: cErr } = await supabaseAdmin
    .from("nurse_weekly_billing_lines")
    .select("id", { count: "exact", head: true })
    .eq("billing_id", billingId);

  if (cErr) return { ok: false, error: cErr.message };
  if (!count || count < 1) {
    return { ok: false, error: "Add at least one line before submitting." };
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .update({
      status: "submitted",
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", billingId)
    .eq("employee_id", staff.applicant_id)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  revalidatePath("/admin/payroll");
  return { ok: true };
}
