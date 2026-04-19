import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ensureNurseWeeklyBilling } from "@/lib/payroll/nurse-weekly-billing";
import { loadAssignablePatientsForNurse } from "@/lib/payroll/nurse-assignable-patients";
import { getPayPeriodForDate } from "@/lib/payroll/pay-period";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

import { SelfBillingView, type SelfBillingLineVM } from "./SelfBillingView";

function displayPatientName(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object") return null;
  const full = "full_name" in c && typeof (c as { full_name?: string }).full_name === "string" ? (c as { full_name: string }).full_name.trim() : "";
  if (full) return full;
  const fn = "first_name" in c && typeof (c as { first_name?: string }).first_name === "string" ? (c as { first_name: string }).first_name : "";
  const ln = "last_name" in c && typeof (c as { last_name?: string }).last_name === "string" ? (c as { last_name: string }).last_name : "";
  const joined = [fn, ln].filter(Boolean).join(" ").trim();
  return joined || null;
}

export default async function WorkspacePayPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const applicantId = staff.applicant_id;

  if (!applicantId) {
    return (
      <>
        <AdminPageHeader
          accent="indigo"
          eyebrow="Workspace"
          title="Pay"
          description="Your account is not linked to an employee record yet. Ask HR to connect your login to payroll."
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const bounds = getPayPeriodForDate(new Date());

  const [assignablePatients, billing] = await Promise.all([
    loadAssignablePatientsForNurse(staff.user_id),
    ensureNurseWeeklyBilling(applicantId, bounds),
  ]);

  const { data: lineRows } = await supabase
    .from("nurse_weekly_billing_lines")
    .select("id, patient_id, service_date, line_type, amount, notes")
    .eq("billing_id", billing.id)
    .order("service_date", { ascending: false });

  const patientLabel = new Map<string, string>();
  for (const p of assignablePatients) {
    patientLabel.set(p.id, p.label);
  }

  const linePatientIds = [...new Set((lineRows ?? []).map((r) => String(r.patient_id)))].filter(
    (id) => id && !patientLabel.has(id)
  );

  if (linePatientIds.length > 0) {
    const { data: extraPatients } = await supabaseAdmin
      .from("patients")
      .select("id, contacts ( full_name, first_name, last_name )")
      .in("id", linePatientIds);
    for (const row of extraPatients ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (!id) continue;
      patientLabel.set(id, displayPatientName((row as { contacts?: unknown }).contacts) ?? "Patient");
    }
  }

  const lines: SelfBillingLineVM[] = (lineRows ?? []).map((r) => {
    const pid = String(r.patient_id ?? "");
    return {
      id: String(r.id),
      patientId: pid,
      patientName: patientLabel.get(pid) ?? "Patient",
      serviceDate: typeof r.service_date === "string" ? r.service_date : "",
      lineType: typeof r.line_type === "string" ? r.line_type : "visit",
      amount: Number(r.amount ?? 0),
      notes: typeof r.notes === "string" ? r.notes : null,
    };
  });

  const status = billing.status as "draft" | "submitted" | "paid";

  const deadlineMs = Date.parse(bounds.submissionDeadline);
  // Evaluated per-request for weekly submission cutoff (workspace Pay).
  // eslint-disable-next-line react-hooks/purity -- intentional wall-clock comparison for this request
  const deadlinePassed = Date.now() > deadlineMs;

  return (
    <>
      <AdminPageHeader
        accent="sky"
        eyebrow="Workspace"
        title="Pay"
        metaLine={`Week of ${bounds.payPeriodStart} – ${bounds.payPeriodEnd}`}
        description="Add visits and commission lines for this week, review the total, then submit your invoice."
        footer={
          <div className="space-y-6 px-5 py-5 sm:px-8">
            {assignablePatients.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                You do not have any active patient assignments yet. When you are assigned patients, they will appear in the
                patient search so you can add lines.
              </p>
            ) : null}
            <SelfBillingView
              billingId={billing.id}
              status={status}
              payPeriodStart={bounds.payPeriodStart}
              payPeriodEnd={bounds.payPeriodEnd}
              deadlineIso={bounds.submissionDeadline}
              deadlinePassed={deadlinePassed}
              lines={lines}
              patients={assignablePatients}
            />
          </div>
        }
      />
    </>
  );
}
