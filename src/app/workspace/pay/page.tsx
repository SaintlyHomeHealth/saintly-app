import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ensureNurseWeeklyBilling, fetchNurseWeeklyBillingByPeriodOptional } from "@/lib/payroll/nurse-weekly-billing";
import { loadAssignablePatientsForNurse } from "@/lib/payroll/nurse-assignable-patients";
import { getPayPeriodForDate } from "@/lib/payroll/pay-period";
import { isPayWeekInAllowedNurseBillingWindow, selfBillingCalendarTimeZone } from "@/lib/payroll/self-billing-dates";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

import { PayWeekPicker } from "./PayWeekPicker";
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

export default async function WorkspacePayPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
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
  const defaultBounds = getPayPeriodForDate(new Date());
  const sp = await searchParams;
  const weekRaw = typeof sp?.week === "string" ? sp.week.trim() : "";
  const viewingBounds =
    /^\d{4}-\d{2}-\d{2}$/.test(weekRaw) && !Number.isNaN(Date.parse(`${weekRaw}T12:00:00`))
      ? getPayPeriodForDate(new Date(`${weekRaw}T12:00:00`))
      : defaultBounds;
  const isCurrentPayWeek =
    viewingBounds.payPeriodStart === defaultBounds.payPeriodStart &&
    viewingBounds.payPeriodEnd === defaultBounds.payPeriodEnd;

  const [assignablePatients, billingResolved, historyWeeksResult] = await Promise.all([
    loadAssignablePatientsForNurse(staff.user_id),
    isCurrentPayWeek
      ? ensureNurseWeeklyBilling(applicantId, viewingBounds)
      : fetchNurseWeeklyBillingByPeriodOptional(applicantId, viewingBounds),
    supabaseAdmin
      .from("nurse_weekly_billings")
      .select("pay_period_start, pay_period_end")
      .eq("employee_id", applicantId)
      .order("pay_period_start", { ascending: false })
      .limit(52),
  ]);

  const weekOptions = (historyWeeksResult.data ?? []).map((r) => ({
    start: String(r.pay_period_start ?? ""),
    end: String(r.pay_period_end ?? ""),
  }));

  const billing = billingResolved;
  if (!billing) {
    return (
      <>
        <AdminPageHeader
          accent="sky"
          eyebrow="Workspace"
          title="Pay"
          metaLine={`Week ${viewingBounds.payPeriodStart} – ${viewingBounds.payPeriodEnd}`}
          description="No saved invoice for this week yet. Choose another week from your history, or return to the current period."
          footer={
            <div className="space-y-4 px-5 py-5 sm:px-8">
              <PayWeekPicker
                selectedWeekStart={viewingBounds.payPeriodStart}
                currentPeriodWeekStart={defaultBounds.payPeriodStart}
                currentPeriodWeekEnd={defaultBounds.payPeriodEnd}
                weeks={weekOptions}
              />
            </div>
          }
        />
      </>
    );
  }

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

  const deadlineMs = Date.parse(viewingBounds.submissionDeadline);
  // Evaluated per-request for weekly submission cutoff (workspace Pay).
  // eslint-disable-next-line react-hooks/purity -- intentional wall-clock comparison for this request
  const deadlinePassed = Date.now() > deadlineMs;

  const returnedToDraftAt = billing.returned_to_draft_at;
  const submissionBlockedByDeadline = deadlinePassed && !returnedToDraftAt;

  const inNurseBillingWindow = isPayWeekInAllowedNurseBillingWindow(
    viewingBounds.payPeriodStart,
    new Date(),
    selfBillingCalendarTimeZone()
  );

  const allowNurseEdit = status === "draft" && inNurseBillingWindow;
  const canReopenSubmitted = status === "submitted" && inNurseBillingWindow;

  const headerDescription =
    inNurseBillingWindow && status === "draft"
      ? "Add visits and commission lines for this week, review the total, then submit your invoice."
      : inNurseBillingWindow && status === "submitted"
        ? "Submitted to payroll. Reopen the invoice if you need to fix a line or add a late visit—then submit again."
        : inNurseBillingWindow && status === "paid"
          ? "Marked paid. Your entries are saved here for reference."
          : !inNurseBillingWindow
            ? "This pay week is outside your billing window (you can work on the current week anytime; last week is available on Mondays only)."
            : "Your entries are saved here for reference.";

  return (
    <>
      <AdminPageHeader
        accent="sky"
        eyebrow="Workspace"
        title="Pay"
        metaLine={`Week of ${viewingBounds.payPeriodStart} – ${viewingBounds.payPeriodEnd}`}
        description={headerDescription}
        footer={
          <div className="space-y-6 px-5 py-5 sm:px-8">
            <PayWeekPicker
              selectedWeekStart={viewingBounds.payPeriodStart}
              currentPeriodWeekStart={defaultBounds.payPeriodStart}
              currentPeriodWeekEnd={defaultBounds.payPeriodEnd}
              weeks={weekOptions}
            />
            {assignablePatients.length === 0 && allowNurseEdit ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                You do not have any active patient assignments yet. When you are assigned patients, they will appear in the
                patient search so you can add lines.
              </p>
            ) : null}
            <SelfBillingView
              billingId={billing.id}
              status={status}
              deadlineIso={viewingBounds.submissionDeadline}
              submissionBlockedByDeadline={submissionBlockedByDeadline}
              allowNurseEdit={allowNurseEdit}
              canReopenSubmitted={canReopenSubmitted}
              lines={lines}
              patients={assignablePatients}
            />
          </div>
        }
      />
    </>
  );
}
