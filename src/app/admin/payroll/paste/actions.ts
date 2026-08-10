"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { ensureNurseWeeklyBilling } from "@/lib/payroll/nurse-weekly-billing";
import {
  buildImportFingerprint,
  normalizePersonNameKey,
  parseVisitPaste,
} from "@/lib/payroll/parse-visit-paste";
import { getPayPeriodForDate, serviceDateInPeriod } from "@/lib/payroll/pay-period";
import { resolveRnVisitRate, type RnVisitLineType } from "@/lib/payroll/resolve-rn-visit-rate";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type PasteImportProposedLine = {
  rowKey: string;
  patientName: string;
  clinicianName: string;
  serviceDate: string;
  employeeId: string | null;
  employeeName: string | null;
  patientId: string | null;
  patientLabel: string | null;
  payerHint: string | null;
  lineType: RnVisitLineType;
  amount: number;
  rateSource: string;
  appliedTangoOverride: boolean;
  inPayPeriod: boolean;
  alreadyImported: boolean;
  skip: boolean;
  blockReason: string | null;
};

export type PasteImportPreviewResult =
  | {
      ok: true;
      payPeriodStart: string;
      payPeriodEnd: string;
      skippedIncomplete: number;
      warnings: string[];
      lines: PasteImportProposedLine[];
      patientOptions: { id: string; label: string; payerHint: string | null }[];
    }
  | { ok: false; error: string };

export type PasteImportSaveLine = {
  employeeId: string;
  patientId: string;
  patientName: string;
  serviceDate: string;
  lineType: RnVisitLineType;
  amount: number;
  notes?: string;
};

function displayName(first?: string | null, last?: string | null, full?: string | null) {
  if (full && full.trim()) return full.trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function contactLabel(raw: unknown): { label: string; first: string; last: string } {
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object") return { label: "Patient", first: "", last: "" };
  const first = typeof (c as { first_name?: string }).first_name === "string" ? (c as { first_name: string }).first_name : "";
  const last = typeof (c as { last_name?: string }).last_name === "string" ? (c as { last_name: string }).last_name : "";
  const full = typeof (c as { full_name?: string }).full_name === "string" ? (c as { full_name: string }).full_name : "";
  return { label: displayName(first, last, full) || "Patient", first, last };
}

async function assertManager() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: null, error: "Access denied." };
  }
  return { ok: staff, error: null as string | null };
}

export async function previewVisitPasteAction(input: {
  pasteText: string;
  weekStart: string;
}): Promise<PasteImportPreviewResult> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const weekRaw = input.weekStart.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekRaw)) {
    return { ok: false, error: "Choose a valid pay week." };
  }

  const period = getPayPeriodForDate(new Date(`${weekRaw}T12:00:00`));
  const parsed = parseVisitPaste(input.pasteText || "");
  if (!parsed.rows.length) {
    return {
      ok: true,
      payPeriodStart: period.payPeriodStart,
      payPeriodEnd: period.payPeriodEnd,
      skippedIncomplete: parsed.skippedIncomplete,
      warnings: parsed.warnings,
      lines: [],
      patientOptions: [],
    };
  }

  const [{ data: applicants }, { data: patientRows }, { data: existingFingerprints }] = await Promise.all([
    supabaseAdmin.from("applicants").select("id, first_name, last_name").limit(2000),
    supabaseAdmin
      .from("patients")
      .select("id, payer_name, contacts(full_name, first_name, last_name)")
      .is("archived_at", null)
      .limit(3000),
    supabaseAdmin
      .from("nurse_weekly_billing_lines")
      .select("import_fingerprint")
      .not("import_fingerprint", "is", null)
      .limit(10000),
  ]);

  const fingerprintSet = new Set(
    (existingFingerprints ?? [])
      .map((r) => (typeof r.import_fingerprint === "string" ? r.import_fingerprint : ""))
      .filter(Boolean)
  );

  type Emp = { id: string; first_name: string | null; last_name: string | null; name: string; key: string };
  const employees: Emp[] = (applicants ?? []).map((a) => {
    const name = displayName(a.first_name, a.last_name);
    return {
      id: String(a.id),
      first_name: a.first_name,
      last_name: a.last_name,
      name,
      key: normalizePersonNameKey(`${a.last_name || ""}, ${a.first_name || ""}`) || normalizePersonNameKey(name),
    };
  });

  const empByKey = new Map<string, Emp>();
  for (const e of employees) {
    if (e.key) empByKey.set(e.key, e);
  }

  type Pat = { id: string; label: string; payerHint: string | null; key: string };
  const patients: Pat[] = [];
  for (const row of patientRows ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const c = contactLabel((row as { contacts?: unknown }).contacts);
    const payerHint = typeof row.payer_name === "string" && row.payer_name.trim() ? row.payer_name.trim() : null;
    const key =
      normalizePersonNameKey(`${c.last}, ${c.first}`) ||
      normalizePersonNameKey(c.label);
    patients.push({ id, label: c.label, payerHint, key });
  }

  const patientByKey = new Map<string, Pat>();
  for (const p of patients) {
    if (p.key && !patientByKey.has(p.key)) patientByKey.set(p.key, p);
  }

  const employeeIds = new Set<string>();
  const resolvedRows = parsed.rows.map((row) => {
    const clinicianKey = normalizePersonNameKey(row.clinicianName);
    const patientKey = normalizePersonNameKey(row.patientName);
    const emp = clinicianKey ? empByKey.get(clinicianKey) ?? null : null;
    const pat = patientKey ? patientByKey.get(patientKey) ?? null : null;
    if (emp) employeeIds.add(emp.id);
    return { row, emp, pat, clinicianKey, patientKey };
  });

  const contractByEmployee = new Map<
    string,
    { pay_rate: number; per_visit_rates: unknown; effective_date: string }[]
  >();

  if (employeeIds.size > 0) {
    const { data: contracts } = await supabaseAdmin
      .from("employee_contracts")
      .select("applicant_id, pay_rate, per_visit_rates, effective_date, contract_status")
      .in("applicant_id", [...employeeIds])
      .eq("contract_status", "signed")
      .order("effective_date", { ascending: false });

    for (const c of contracts ?? []) {
      const aid = String(c.applicant_id ?? "");
      if (!aid) continue;
      const list = contractByEmployee.get(aid) ?? [];
      list.push({
        pay_rate: Number(c.pay_rate),
        per_visit_rates: c.per_visit_rates,
        effective_date: String(c.effective_date ?? ""),
      });
      contractByEmployee.set(aid, list);
    }
  }

  // Also load existing lines for these employees (any week) for soft dedupe without fingerprint
  const softDedupeKeys = new Set<string>();
  if (employeeIds.size > 0) {
    const { data: billings } = await supabaseAdmin
      .from("nurse_weekly_billings")
      .select("id, employee_id, nurse_weekly_billing_lines(patient_id, service_date, line_type)")
      .in("employee_id", [...employeeIds])
      .limit(500);

    const patientIdToKey = new Map(patients.map((p) => [p.id, p.key]));
    for (const b of billings ?? []) {
      const empId = String(b.employee_id ?? "");
      const raw = b.nurse_weekly_billing_lines;
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const L of arr) {
        const pid = String((L as { patient_id?: string }).patient_id ?? "");
        const sd = String((L as { service_date?: string }).service_date ?? "");
        const lt = String((L as { line_type?: string }).line_type ?? "visit");
        const pKey = patientIdToKey.get(pid) || pid;
        if (empId && sd) softDedupeKeys.add(`${empId}|${pKey}|${sd}|${lt}`);
      }
    }
  }

  const lines: PasteImportProposedLine[] = resolvedRows.map(({ row, emp, pat, patientKey }, index) => {
    const lineType: RnVisitLineType = "visit";
    const inPayPeriod = serviceDateInPeriod(row.serviceDate, period.payPeriodStart, period.payPeriodEnd);

    let agreement: { payRate: number; perVisitRates: unknown } | null = null;
    if (emp) {
      const list = contractByEmployee.get(emp.id) ?? [];
      const hit = list.find((c) => c.effective_date && c.effective_date <= row.serviceDate) ?? list[0] ?? null;
      if (hit && Number.isFinite(hit.pay_rate)) {
        agreement = { payRate: hit.pay_rate, perVisitRates: hit.per_visit_rates };
      }
    }

    const rate = resolveRnVisitRate({
      lineType,
      payerHint: pat?.payerHint ?? null,
      agreement,
    });

    const fingerprint = emp
      ? buildImportFingerprint({
          employeeId: emp.id,
          patientKey: patientKey || row.patientName,
          serviceDate: row.serviceDate,
          lineType,
        })
      : "";

    const softKey = emp
      ? `${emp.id}|${patientKey || normalizePersonNameKey(row.patientName)}|${row.serviceDate}|${lineType}`
      : "";

    const alreadyImported = Boolean(
      (fingerprint && fingerprintSet.has(fingerprint)) || (softKey && softDedupeKeys.has(softKey))
    );

    let blockReason: string | null = null;
    if (!emp) blockReason = "Clinician not matched to an employee";
    else if (!agreement) blockReason = "No signed agreement rate found";
    else if (rate.source === "missing") blockReason = "Agreement has no usable visit rate";
    else if (!inPayPeriod) blockReason = "Outside selected pay week";
    else if (alreadyImported) blockReason = "Already imported / paid";
    else if (!pat) blockReason = "Patient not matched — select a patient before save";

    const skip = Boolean(blockReason);

    return {
      rowKey: `${row.serviceDate}|${normalizePersonNameKey(row.clinicianName)}|${patientKey}|${index}`,
      patientName: row.patientName,
      clinicianName: row.clinicianName,
      serviceDate: row.serviceDate,
      employeeId: emp?.id ?? null,
      employeeName: emp?.name ?? null,
      patientId: pat?.id ?? null,
      patientLabel: pat?.label ?? null,
      payerHint: pat?.payerHint ?? null,
      lineType,
      amount: rate.amount,
      rateSource: rate.source,
      appliedTangoOverride: rate.appliedTangoOverride,
      inPayPeriod,
      alreadyImported,
      skip,
      blockReason,
    };
  });

  const patientOptions = patients
    .map((p) => ({ id: p.id, label: p.label, payerHint: p.payerHint }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    ok: true,
    payPeriodStart: period.payPeriodStart,
    payPeriodEnd: period.payPeriodEnd,
    skippedIncomplete: parsed.skippedIncomplete,
    warnings: parsed.warnings,
    lines,
    patientOptions,
  };
}

export async function recalculatePasteLineRateAction(input: {
  employeeId: string;
  serviceDate: string;
  lineType: RnVisitLineType;
  payerHint: string | null;
}): Promise<{ ok: true; amount: number; rateSource: string; appliedTangoOverride: boolean } | { ok: false; error: string }> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: contracts } = await supabaseAdmin
    .from("employee_contracts")
    .select("pay_rate, per_visit_rates, effective_date")
    .eq("applicant_id", input.employeeId)
    .eq("contract_status", "signed")
    .lte("effective_date", input.serviceDate)
    .order("effective_date", { ascending: false })
    .limit(1);

  const hit = contracts?.[0];
  if (!hit) {
    return { ok: true, amount: 0, rateSource: "missing", appliedTangoOverride: false };
  }

  const rate = resolveRnVisitRate({
    lineType: input.lineType,
    payerHint: input.payerHint,
    agreement: { payRate: Number(hit.pay_rate), perVisitRates: hit.per_visit_rates },
  });

  return {
    ok: true,
    amount: rate.amount,
    rateSource: rate.source,
    appliedTangoOverride: rate.appliedTangoOverride,
  };
}

export async function saveVisitPasteImportAction(input: {
  weekStart: string;
  lines: PasteImportSaveLine[];
}): Promise<
  | { ok: true; inserted: number; skipped: number; billingIds: string[]; errors: string[] }
  | { ok: false; error: string }
> {
  const gate = await assertManager();
  if (!gate.ok) return { ok: false, error: gate.error };

  const weekRaw = input.weekStart.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekRaw)) {
    return { ok: false, error: "Choose a valid pay week." };
  }

  const period = getPayPeriodForDate(new Date(`${weekRaw}T12:00:00`));
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!lines.length) return { ok: false, error: "No lines to save." };

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const billingIds = new Set<string>();

  // Preload patient keys for fingerprints
  const patientIds = [...new Set(lines.map((l) => l.patientId).filter(Boolean))];
  const patientKeyById = new Map<string, string>();
  if (patientIds.length) {
    const { data: pRows } = await supabaseAdmin
      .from("patients")
      .select("id, contacts(full_name, first_name, last_name)")
      .in("id", patientIds);
    for (const row of pRows ?? []) {
      const id = String(row.id ?? "");
      const c = contactLabel((row as { contacts?: unknown }).contacts);
      const key = normalizePersonNameKey(`${c.last}, ${c.first}`) || normalizePersonNameKey(c.label);
      if (id && key) patientKeyById.set(id, key);
    }
  }

  for (const line of lines) {
    const employeeId = String(line.employeeId || "").trim();
    const patientId = String(line.patientId || "").trim();
    const serviceDate = String(line.serviceDate || "").trim();
    const lineType = line.lineType === "soc" ? "soc" : "visit";
    const amount = Math.round(Number(line.amount) * 100) / 100;

    if (!employeeId || !patientId || !serviceDate) {
      skipped += 1;
      errors.push(`Skipped incomplete line (${line.patientName || "patient"} / ${serviceDate || "?"}).`);
      continue;
    }

    if (!serviceDateInPeriod(serviceDate, period.payPeriodStart, period.payPeriodEnd)) {
      skipped += 1;
      errors.push(`Skipped ${line.patientName} ${serviceDate}: outside pay week.`);
      continue;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      skipped += 1;
      errors.push(`Skipped ${line.patientName} ${serviceDate}: invalid amount.`);
      continue;
    }

    const patientKey =
      patientKeyById.get(patientId) || normalizePersonNameKey(line.patientName) || patientId;
    const fingerprint = buildImportFingerprint({
      employeeId,
      patientKey,
      serviceDate,
      lineType,
    });

    let billing;
    try {
      billing = await ensureNurseWeeklyBilling(employeeId, period);
    } catch (e) {
      skipped += 1;
      errors.push(e instanceof Error ? e.message : "Could not open weekly billing.");
      continue;
    }

    if (billing.status === "paid") {
      skipped += 1;
      errors.push(`Skipped ${line.patientName}: nurse invoice already paid for this week.`);
      continue;
    }

    const notes =
      typeof line.notes === "string" && line.notes.trim()
        ? line.notes.trim()
        : `Paste import · ${line.patientName}`;

    const { error } = await supabaseAdmin.from("nurse_weekly_billing_lines").insert({
      billing_id: billing.id,
      patient_id: patientId,
      service_date: serviceDate,
      line_type: lineType,
      amount,
      notes,
      import_fingerprint: fingerprint,
      source: "paste_import",
    });

    if (error) {
      skipped += 1;
      if (error.code === "23505" || /import_fingerprint|duplicate/i.test(error.message)) {
        errors.push(`Already imported: ${line.patientName} on ${serviceDate}.`);
      } else {
        errors.push(`${line.patientName} ${serviceDate}: ${error.message}`);
      }
      continue;
    }

    inserted += 1;
    billingIds.add(billing.id);
  }

  revalidatePath("/admin/payroll");
  revalidatePath("/admin/payroll/paste");
  revalidatePath("/workspace/pay");
  for (const id of billingIds) {
    revalidatePath(`/admin/payroll/nurse/${id}`);
  }

  return { ok: true, inserted, skipped, billingIds: [...billingIds], errors };
}
