"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { nurseMayUsePatient } from "@/lib/payroll/nurse-assignable-patients";
import { getPayPeriodForDate } from "@/lib/payroll/pay-period";
import {
  getSelectableServiceDateBoundsInTimeZone,
  isIsoDateInInclusiveRange,
  isPayWeekInAllowedNurseBillingWindow,
  selfBillingCalendarTimeZone,
} from "@/lib/payroll/self-billing-dates";
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
    .select("id, employee_id, status, pay_period_start, pay_period_end, returned_to_draft_at")
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
    returned_to_draft_at: string | null;
  };
}

export async function addSelfBillingLineAction(input: {
  billingId: string;
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
  const tz = selfBillingCalendarTimeZone();
  const now = new Date();

  const row = await loadOwnBillingRow(input.billingId, applicantId);
  if (!row || row.status !== "draft") {
    return { ok: false, error: "This invoice is not editable right now." };
  }
  if (!isPayWeekInAllowedNurseBillingWindow(row.pay_period_start, now, tz)) {
    return {
      ok: false,
      error: "This pay week is not open for editing. You can work on the current week anytime; last week is editable on Mondays only.",
    };
  }

  const okPatient = await nurseMayUsePatient(staff.user_id, input.patientId);
  if (!okPatient) return { ok: false, error: "That patient is not available for your assignments." };

  const sd = input.serviceDate.trim();
  const svcBounds = getSelectableServiceDateBoundsInTimeZone(now, tz);
  if (!sd || !isIsoDateInInclusiveRange(sd, svcBounds.min, svcBounds.max)) {
    return { ok: false, error: "Service date is not in the allowed billing range for this period." };
  }

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: "Enter a valid amount (0 or greater)." };

  const notesTrim = input.notes.trim();
  const { error } = await supabaseAdmin.from("nurse_weekly_billing_lines").insert({
    billing_id: input.billingId,
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
  const tz = selfBillingCalendarTimeZone();
  if (!isPayWeekInAllowedNurseBillingWindow(row.pay_period_start, new Date(), tz)) {
    return {
      ok: false,
      error: "This pay week is not open for editing now.",
    };
  }

  const okPatient = await nurseMayUsePatient(staff.user_id, input.patientId);
  if (!okPatient) return { ok: false, error: "That patient is not available for your assignments." };

  const sd = input.serviceDate.trim();
  const svcBounds = getSelectableServiceDateBoundsInTimeZone(new Date(), selfBillingCalendarTimeZone());
  if (!sd || !isIsoDateInInclusiveRange(sd, svcBounds.min, svcBounds.max)) {
    return { ok: false, error: "Service date is not in the allowed billing range for this period." };
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
  const tz = selfBillingCalendarTimeZone();
  if (!isPayWeekInAllowedNurseBillingWindow(row.pay_period_start, new Date(), tz)) {
    return { ok: false, error: "This pay week is not open for editing now." };
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

  const tz = selfBillingCalendarTimeZone();
  const now = new Date();
  if (!isPayWeekInAllowedNurseBillingWindow(row.pay_period_start, now, tz)) {
    return {
      ok: false,
      error: "This pay week is not open for submission. Use the current week anytime; last week only on Mondays.",
    };
  }

  const rowBounds = getPayPeriodForDate(new Date(`${row.pay_period_start}T12:00:00`));
  const deadline = new Date(rowBounds.submissionDeadline);
  const lateResubmitAfterReopen =
    typeof row.returned_to_draft_at === "string" && row.returned_to_draft_at.trim().length > 0;
  if (!lateResubmitAfterReopen && Date.now() > deadline.getTime()) {
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

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .update({
      status: "submitted",
      submitted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", billingId)
    .eq("employee_id", staff.applicant_id)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  revalidatePath("/admin/payroll");
  return { ok: true };
}

/** Move submitted invoice back to draft so the nurse can edit and resubmit (only until paid). */
export async function reopenSelfBillingWeekAction(
  billingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff?.applicant_id) {
    return { ok: false, error: "Your profile is not linked to payroll yet. Contact HR." };
  }

  const row = await loadOwnBillingRow(billingId, staff.applicant_id);
  if (!row || row.status !== "submitted") {
    return { ok: false, error: "Only a submitted invoice can be reopened." };
  }

  const tz = selfBillingCalendarTimeZone();
  const instant = new Date();
  if (!isPayWeekInAllowedNurseBillingWindow(row.pay_period_start, instant, tz)) {
    return {
      ok: false,
      error:
        "You can reopen this week’s invoice only while it is in your billing window: the current week anytime, or last week on Mondays (in the payroll calendar).",
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .update({
      status: "draft",
      submitted_at: null,
      returned_to_draft_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", billingId)
    .eq("employee_id", staff.applicant_id)
    .eq("status", "submitted");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/workspace/pay");
  revalidatePath("/admin/payroll");
  return { ok: true };
}
