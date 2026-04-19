import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { fetchYtdPaidForEmployee } from "@/lib/payroll/nurse-billing-ytd";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher, isPayrollApprover } from "@/lib/staff-profile";

import { NurseBillingDetail, type NurseBillingDetailLineVM } from "../NurseBillingDetail";

function patientContactLabel(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "Patient";
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object") return "Patient";
  const full = "full_name" in c && typeof (c as { full_name?: string }).full_name === "string"
    ? (c as { full_name: string }).full_name.trim()
    : "";
  if (full) return full;
  const fn = "first_name" in c && typeof (c as { first_name?: string }).first_name === "string" ? (c as { first_name: string }).first_name : "";
  const ln = "last_name" in c && typeof (c as { last_name?: string }).last_name === "string" ? (c as { last_name: string }).last_name : "";
  const j = [fn, ln].filter(Boolean).join(" ").trim();
  return j || "Patient";
}

export default async function NurseBillingDetailPage({
  params,
}: {
  params: Promise<{ billingId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { billingId } = await params;
  if (!billingId?.trim()) notFound();

  const approver = isPayrollApprover(staff);

  const [{ data: billing }, { data: patientRows }] = await Promise.all([
    supabaseAdmin
      .from("nurse_weekly_billings")
      .select(
        `
        id,
        status,
        employee_id,
        pay_period_start,
        pay_period_end,
        submitted_at,
        paid_at,
        nurse_weekly_billing_lines (
          id,
          patient_id,
          service_date,
          line_type,
          amount,
          notes
        )
      `
      )
      .eq("id", billingId)
      .maybeSingle(),
    supabaseAdmin.from("patients").select("id, contacts(full_name, first_name, last_name)").limit(500),
  ]);

  if (!billing) notFound();

  const st = String(billing.status ?? "draft");
  const status: "draft" | "submitted" | "paid" =
    st === "submitted" || st === "paid" || st === "draft" ? st : "draft";

  const { data: emp } = await supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name")
    .eq("id", billing.employee_id)
    .maybeSingle();

  const employeeName = emp
    ? [emp.first_name, emp.last_name].filter(Boolean).join(" ")
    : String(billing.employee_id);

  const payPeriodStart = String(billing.pay_period_start ?? "");
  const payPeriodEnd = String(billing.pay_period_end ?? "");

  const calendarYear = new Date().getFullYear();
  const ytdPaid = await fetchYtdPaidForEmployee(String(billing.employee_id), calendarYear);

  const patientOptions =
    (patientRows ?? []).map((row) => ({
      id: row.id,
      label: patientContactLabel(row.contacts),
    })) ?? [];

  const rawLines = billing.nurse_weekly_billing_lines;
  const arr = Array.isArray(rawLines) ? rawLines : rawLines ? [rawLines] : [];
  const patientLabel = new Map<string, string>();
  for (const p of patientOptions) {
    patientLabel.set(p.id, p.label);
  }
  const lines: NurseBillingDetailLineVM[] = arr.map((L) => {
    const pid = String((L as { patient_id?: string }).patient_id ?? "");
    const amt = Number((L as { amount?: unknown }).amount ?? 0);
    return {
      id: String((L as { id?: string }).id ?? ""),
      patientId: pid,
      patientName: patientLabel.get(pid) ?? "Patient",
      serviceDate: typeof (L as { service_date?: string }).service_date === "string" ? (L as { service_date: string }).service_date : "",
      lineType: typeof (L as { line_type?: string }).line_type === "string" ? (L as { line_type: string }).line_type : "visit",
      amount: amt,
      notes: typeof (L as { notes?: string | null }).notes === "string" && (L as { notes: string }).notes.trim()
        ? (L as { notes: string }).notes
        : null,
    };
  });
  const weeklyTotal = lines.reduce((s, l) => s + l.amount, 0);

  /** Extra patient names for lines whose id was not in the first page of patients. */
  const missingIds = [...new Set(lines.map((l) => l.patientId).filter((id) => id && !patientLabel.has(id)))];
  if (missingIds.length > 0) {
    const { data: extra } = await supabaseAdmin
      .from("patients")
      .select("id, contacts(full_name, first_name, last_name)")
      .in("id", missingIds);
    for (const row of extra ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (!id) continue;
      const label = patientContactLabel((row as { contacts?: unknown }).contacts);
      patientLabel.set(id, label);
    }
    for (let i = 0; i < lines.length; i++) {
      const pid = lines[i].patientId;
      const nm = patientLabel.get(pid);
      if (nm) lines[i] = { ...lines[i], patientName: nm };
    }
    for (const id of missingIds) {
      if (!patientOptions.some((p) => p.id === id)) {
        patientOptions.push({ id, label: patientLabel.get(id) ?? "Patient" });
      }
    }
  }

  const submittedAt = typeof billing.submitted_at === "string" ? billing.submitted_at : null;
  const paidAt = typeof billing.paid_at === "string" ? billing.paid_at : null;

  const canEditLines = status !== "paid";
  const canApprove = approver && status === "submitted";

  return (
    <>
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <AdminPageHeader
          accent="sky"
          eyebrow="Payroll"
          title="Invoice review"
          description={
            <span>
              {employeeName} ·{" "}
              <Link href={`/admin/payroll?week=${encodeURIComponent(payPeriodStart)}`} className="font-medium text-sky-800 hover:underline">
                Week {payPeriodStart} – {payPeriodEnd}
              </Link>
            </span>
          }
        />

        <div className="mt-8">
          <NurseBillingDetail
            billingId={String(billing.id)}
            employeeName={employeeName}
            payPeriodStart={payPeriodStart}
            payPeriodEnd={payPeriodEnd}
            status={status}
            submittedAt={submittedAt}
            paidAt={paidAt}
            weeklyTotal={weeklyTotal}
            ytdPaid={ytdPaid}
            lines={lines}
            patientOptions={patientOptions}
            canEditLines={canEditLines}
            canApprove={canApprove}
          />
        </div>
      </div>
    </>
  );
}
