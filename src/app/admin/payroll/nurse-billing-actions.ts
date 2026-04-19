"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher, isPayrollApprover } from "@/lib/staff-profile";

import type { BillingLineType } from "@/app/workspace/pay/self-billing-types";

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function serviceDateInBillingPeriod(serviceDate: string, periodStart: string, periodEnd: string): boolean {
  return serviceDate >= periodStart && serviceDate <= periodEnd;
}

async function assertManager() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: null as const, error: "Access denied." as const };
  }
  return { ok: staff, error: null };
}

type BillingHead = {
  id: string;
  status: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
};

async function loadBillingHead(billingId: string): Promise<BillingHead | null> {
  const { data, error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select("id, status, employee_id, pay_period_start, pay_period_end")
    .eq("id", billingId)
    .maybeSingle();
  if (error || !data) return null;
  return data as BillingHead;
}

export async function adminUpdateNurseBillingLineAction(input: {
  billingId: string;
  lineId: string;
  patientId: string;
  serviceDate: string;
  lineType: BillingLineType;
  amount: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const head = await loadBillingHead(input.billingId);
  if (!head || head.status === "paid") {
    return { ok: false, error: "This invoice is paid and cannot be edited." };
  }

  const sd = input.serviceDate.trim();
  if (!sd || !serviceDateInBillingPeriod(sd, head.pay_period_start, head.pay_period_end)) {
    return { ok: false, error: "Service date must fall within this pay week." };
  }

  const { data: pRow } = await supabaseAdmin.from("patients").select("id").eq("id", input.patientId).maybeSingle();
  if (!pRow) return { ok: false, error: "Patient not found." };

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: "Enter a valid amount." };

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
    .eq("id", input.lineId)
    .eq("billing_id", input.billingId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/nurse/${input.billingId}`);
  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function adminAddNurseBillingLineAction(input: {
  billingId: string;
  patientId: string;
  serviceDate: string;
  lineType: BillingLineType;
  amount: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const head = await loadBillingHead(input.billingId);
  if (!head || head.status === "paid") {
    return { ok: false, error: "This invoice is paid and cannot be edited." };
  }

  const sd = input.serviceDate.trim();
  if (!sd || !serviceDateInBillingPeriod(sd, head.pay_period_start, head.pay_period_end)) {
    return { ok: false, error: "Service date must fall within this pay week." };
  }

  const { data: pRow } = await supabaseAdmin.from("patients").select("id").eq("id", input.patientId).maybeSingle();
  if (!pRow) return { ok: false, error: "Patient not found." };

  const amount = parseAmount(input.amount);
  if (amount === null) return { ok: false, error: "Enter a valid amount." };

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

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/nurse/${input.billingId}`);
  revalidatePath("/workspace/pay");
  return { ok: true };
}

export async function adminDeleteNurseBillingLineAction(input: {
  billingId: string;
  lineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const head = await loadBillingHead(input.billingId);
  if (!head || head.status === "paid") {
    return { ok: false, error: "This invoice is paid and cannot be edited." };
  }

  const { error } = await supabaseAdmin
    .from("nurse_weekly_billing_lines")
    .delete()
    .eq("id", input.lineId)
    .eq("billing_id", input.billingId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/nurse/${input.billingId}`);
  revalidatePath("/workspace/pay");
  return { ok: true };
}

/** Approve weekly invoice and lock (same as mark paid). */
export async function adminApproveAndMarkPaidAction(billingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !isPayrollApprover(staff)) {
    return { ok: false, error: "Only payroll approvers can approve and mark paid." };
  }

  const { data: row, error: qErr } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select("id, status")
    .eq("id", billingId)
    .maybeSingle();

  if (qErr || !row) return { ok: false, error: "Invoice not found." };
  if (row.status !== "submitted") {
    return { ok: false, error: "Only submitted invoices can be approved." };
  }

  const now = new Date().toISOString();
  const { error: uErr } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
    })
    .eq("id", billingId)
    .eq("status", "submitted");

  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/nurse/${billingId}`);
  revalidatePath("/workspace/pay");
  return { ok: true };
}

/** HTML form compatible wrapper for approve + mark paid. */
export async function adminApproveAndMarkPaidFormAction(formData: FormData): Promise<void> {
  const raw = formData.get("billingId");
  const billingId = typeof raw === "string" ? raw.trim() : "";
  if (!billingId) return;
  await adminApproveAndMarkPaidAction(billingId);
}
