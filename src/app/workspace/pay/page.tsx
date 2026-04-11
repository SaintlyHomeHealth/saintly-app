import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { loadContractForServiceDate } from "@/lib/payroll/contract-for-date";
import { loadAssignablePatientsForNurse } from "@/lib/payroll/nurse-assignable-patients";
import { getPayPeriodForDate, serviceDateInPeriod } from "@/lib/payroll/pay-period";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

import { PayrollDashboardActions } from "./PayrollDashboardActions";
import { PayrollPeriodSummary } from "./PayrollPeriodSummary";
import { PayrollVisitRow } from "./PayrollVisitRow";
import { PayrollWorkflowBar } from "./PayrollWorkflowBar";
import { VisitRowActions } from "./VisitRowActions";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

type VisitRow = {
  id: string;
  visit_type: string;
  status: string;
  service_date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  note_completed: boolean;
  requires_review: boolean | null;
  held_reason: string | null;
  patient_id: string | null;
  visit_duration_minutes?: number | null;
};

type BatchEmbed = {
  id: string;
  pay_date: string | null;
  status: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
};

type ItemRow = {
  id: string;
  gross_amount: number | string | null;
  status: string;
  payout_route: string | null;
  payroll_batch_id: string | null;
  visit_id: string;
  payroll_batches: BatchEmbed | BatchEmbed[] | null;
  visits: VisitRow | VisitRow[] | null;
};

function firstEmbed<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

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

function normalizeVisit(v: VisitRow | null | undefined): VisitRow | null {
  if (!v || typeof v !== "object" || !v.id) return null;
  return {
    id: String(v.id),
    visit_type: typeof v.visit_type === "string" ? v.visit_type : "visit",
    status: typeof v.status === "string" ? v.status : "pending",
    service_date: typeof v.service_date === "string" ? v.service_date : null,
    check_in_time: typeof v.check_in_time === "string" ? v.check_in_time : null,
    check_out_time: typeof v.check_out_time === "string" ? v.check_out_time : null,
    note_completed: Boolean(v.note_completed),
    requires_review: typeof v.requires_review === "boolean" ? v.requires_review : null,
    held_reason: typeof v.held_reason === "string" ? v.held_reason : null,
    patient_id: typeof v.patient_id === "string" ? v.patient_id : null,
    visit_duration_minutes:
      typeof v.visit_duration_minutes === "number" && Number.isFinite(v.visit_duration_minutes)
        ? v.visit_duration_minutes
        : null,
  };
}

function isVisitRowLocked(v: VisitRow, item: ItemRow | undefined): boolean {
  if (v.status === "paid") return true;
  if (!item) return false;
  if (item.payroll_batch_id) return true;
  if (item.status === "paid" || item.status === "submitted") return true;
  return false;
}

function canEndVisitRow(v: VisitRow, locked: boolean): boolean {
  return !locked && v.status === "pending" && Boolean(v.check_in_time) && !v.check_out_time;
}

export default async function WorkspacePayPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const applicantId = staff.applicant_id;
  const year = new Date().getFullYear();

  if (!applicantId) {
    return (
      <>
        <AdminPageHeader
          accent="indigo"
          eyebrow="Workspace"
          title="Payroll"
          description="Your account is not linked to an employee record yet. Ask HR to connect your login to payroll."
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const bounds = getPayPeriodForDate(new Date());
  const deadline = new Date(bounds.submissionDeadline);
  const deadlinePassed = Date.now() > deadline.getTime();

  const [
    { data: visitRows },
    { data: itemRows },
    { data: earningsRow },
    { data: batchRows },
    assignablePatients,
    { data: activeVisitRows },
  ] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id, visit_type, status, service_date, check_in_time, check_out_time, note_completed, requires_review, held_reason, patient_id, visit_duration_minutes"
      )
      .eq("employee_id", applicantId)
      .order("service_date", { ascending: false })
      .limit(200),
    supabase
      .from("payroll_visit_items")
      .select(
        `
        id,
        gross_amount,
        status,
        payout_route,
        payroll_batch_id,
        visit_id,
        payroll_batches ( id, pay_date, status, pay_period_start, pay_period_end ),
        visits ( id, visit_type, status, service_date, check_in_time, check_out_time, note_completed, requires_review, held_reason, patient_id, visit_duration_minutes )
      `
      )
      .eq("employee_id", applicantId)
      .order("updated_at", { ascending: false })
      .limit(400),
    supabase
      .from("employee_earnings")
      .select("ytd_earnings, total_paid, total_pending")
      .eq("employee_id", applicantId)
      .eq("earnings_year", year)
      .maybeSingle(),
    supabase
      .from("payroll_batches")
      .select("id, pay_period_start, pay_period_end, submission_deadline, pay_date, status")
      .eq("pay_period_start", bounds.payPeriodStart)
      .eq("pay_period_end", bounds.payPeriodEnd)
      .maybeSingle(),
    loadAssignablePatientsForNurse(staff.user_id),
    supabaseAdmin
      .from("visits")
      .select("id, visit_type, check_in_time, patient_id")
      .eq("employee_id", applicantId)
      .eq("status", "pending")
      .not("check_in_time", "is", null)
      .is("check_out_time", null)
      .order("check_in_time", { ascending: false })
      .limit(1),
  ]);

  const activeVisitRaw = activeVisitRows?.[0] as
    | { id: string; visit_type: string | null; check_in_time: string | null; patient_id: string | null }
    | undefined;

  let activeVisitForBar: {
    id: string;
    patientName: string;
    visitType: string;
    checkInIso: string;
  } | null = null;

  if (activeVisitRaw?.id && activeVisitRaw.check_in_time) {
    let patientName = "Patient";
    const pid = activeVisitRaw.patient_id;
    if (typeof pid === "string" && pid) {
      const { data: pr } = await supabaseAdmin
        .from("patients")
        .select("id, contacts ( full_name, first_name, last_name )")
        .eq("id", pid)
        .maybeSingle();
      patientName = displayPatientName((pr as { contacts?: unknown } | null)?.contacts) ?? "Patient";
    }
    activeVisitForBar = {
      id: activeVisitRaw.id,
      patientName,
      visitType: typeof activeVisitRaw.visit_type === "string" ? activeVisitRaw.visit_type : "visit",
      checkInIso: activeVisitRaw.check_in_time,
    };
  }

  const items = (itemRows ?? []) as unknown as ItemRow[];
  const visitMap = new Map<string, VisitRow>();

  for (const v of visitRows ?? []) {
    const n = normalizeVisit(v as VisitRow);
    if (n) visitMap.set(n.id, n);
  }

  for (const row of items) {
    const nv = row.visits;
    const v = Array.isArray(nv) ? nv[0] : nv;
    const n = normalizeVisit(v as VisitRow);
    if (n) {
      const prev = visitMap.get(n.id);
      visitMap.set(n.id, prev ? { ...prev, ...n } : n);
    }
  }

  const itemByVisit = new Map(items.map((i) => [i.visit_id, i]));

  const patientIds = [...new Set([...visitMap.values()].map((v) => v.patient_id).filter(Boolean))] as string[];
  const patientLabel = new Map<string, string>();
  if (patientIds.length > 0) {
    const { data: patientRows } = await supabaseAdmin
      .from("patients")
      .select("id, contacts ( full_name, first_name, last_name )")
      .in("id", patientIds);
    for (const row of patientRows ?? []) {
      const label = displayPatientName((row as { contacts?: unknown }).contacts) ?? "Patient";
      patientLabel.set(String(row.id), label);
    }
  }

  const visits = [...visitMap.values()].sort((a, b) => {
    const ad = a.service_date ?? "";
    const bd = b.service_date ?? "";
    return bd.localeCompare(ad);
  });

  const eligibleReady = items.filter(
    (i) =>
      i.status === "ready" &&
      !i.payroll_batch_id &&
      visits.some((v) => {
        if (v.id !== i.visit_id) return false;
        const sd = typeof v.service_date === "string" ? v.service_date : null;
        return Boolean(sd && serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd));
      })
  );

  const estimated = eligibleReady.reduce((s, i) => s + Number(i.gross_amount ?? 0), 0);
  const eligibleVisitIds = new Set(eligibleReady.map((i) => i.visit_id));

  const contractCheckDates = [
    ...new Set(
      visits
        .filter((v) => {
          const sd = typeof v.service_date === "string" ? v.service_date : null;
          if (!sd || !serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd)) return false;
          if (v.status !== "completed") return false;
          if (!v.check_in_time || !v.check_out_time || !v.note_completed) return false;
          return true;
        })
        .map((v) => v.service_date as string)
    ),
  ];

  const contractByServiceDate = new Map<string, boolean>();
  await Promise.all(
    contractCheckDates.map(async (d) => {
      const c = await loadContractForServiceDate(applicantId, d);
      contractByServiceDate.set(d, Boolean(c));
    })
  );

  function visitInPeriod(v: VisitRow): boolean {
    const sd = typeof v.service_date === "string" ? v.service_date : null;
    return Boolean(sd && serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd));
  }

  const needsAttentionVisits = visits.filter((v) => {
    if (!visitInPeriod(v)) return false;
    if (v.status === "paid") return false;
    if (eligibleVisitIds.has(v.id)) return false;
    const item = itemByVisit.get(v.id);
    if (item?.status === "submitted") return false;
    if (item?.status === "paid") return false;
    return true;
  });

  const submittedItems = items
    .filter((i) => i.status === "submitted" && i.payroll_batch_id)
    .sort((a, b) => {
      const ba = firstEmbed(a.payroll_batches)?.pay_period_end ?? "";
      const bb = firstEmbed(b.payroll_batches)?.pay_period_end ?? "";
      return bb.localeCompare(ba);
    });

  const paidHistoryItems = items
    .filter((i) => {
      const b = firstEmbed(i.payroll_batches);
      return i.status === "paid" || b?.status === "paid";
    })
    .slice(0, 30);

  const ytd = Number(earningsRow?.ytd_earnings ?? 0);
  const paid = Number(earningsRow?.total_paid ?? 0);
  const pendingE = Number(earningsRow?.total_pending ?? 0);

  const canSubmit = estimated > 0 && !deadlinePassed;
  const disabledReason = deadlinePassed
    ? "The submission deadline for this pay period has passed. Contact payroll if you need help."
    : estimated <= 0
      ? "Nothing is ready to submit yet. Start and end your visit here, complete your note in Alora, then use Refresh payroll view."
      : null;

  return (
    <>
      <AdminPageHeader
        accent="sky"
        eyebrow="Workspace"
        title="Visit-to-pay action center"
        metaLine={`Pay period ${bounds.payPeriodStart} – ${bounds.payPeriodEnd}`}
        description="Clock in and out, track what is missing for pay, and submit your week when lines are ready."
        footer={
          <div className="space-y-5 px-5 py-5 sm:px-8">
            <PayrollPeriodSummary bounds={bounds} batchStatus={batchRows?.status ?? null} deadlinePassed={deadlinePassed} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ready this week</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{money(estimated)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{eligibleReady.length} visit line{eligibleReady.length === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">YTD gross</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{money(ytd)}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paid / pending</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {money(paid)} paid · {money(pendingE)} pending
                </p>
              </div>
            </div>
            <PayrollDashboardActions />
          </div>
        }
      />

      <section className="mt-6">
        <PayrollWorkflowBar
          activeVisit={activeVisitForBar}
          assignablePatients={assignablePatients}
          deadlinePassed={deadlinePassed}
          eligibleCount={eligibleReady.length}
          eligibleTotalLabel={money(estimated)}
          submitDisabledReason={disabledReason}
        />
      </section>

      <section className="mt-10 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-900">This week · eligible to submit</h2>
          <p className="text-xs text-slate-500">Monday–Sunday work in this window, payroll line ready</p>
        </div>
        <ul className="space-y-3">
          {eligibleReady.length === 0 ? (
            <li className="rounded-2xl border border-slate-200/90 bg-white px-4 py-8 text-center text-sm text-slate-600 shadow-sm">
              No visits are ready for this pay period yet. Complete visits in Alora and check back after sync.
            </li>
          ) : (
            eligibleReady.map((i) => {
              const v = visitMap.get(i.visit_id);
              if (!v) return null;
              const pid = v.patient_id;
              const locked = isVisitRowLocked(v, i);
              return (
                <PayrollVisitRow
                  key={i.id}
                  visit={v}
                  patientName={pid ? patientLabel.get(pid) ?? null : null}
                  grossAmount={Number(i.gross_amount ?? 0)}
                  itemStatus={i.status}
                  payoutRoute={i.payout_route}
                  inCurrentPeriod
                  contractMissing={false}
                  showReasons={false}
                  variant="sky"
                  actions={
                    <VisitRowActions
                      visitId={v.id}
                      locked={locked}
                      canEndVisit={canEndVisitRow(v, locked)}
                      showRequestReview={!locked}
                    />
                  }
                />
              );
            })
          )}
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900">Needs attention</h2>
          <p className="text-xs text-slate-500">Fix documentation or wait for office review</p>
        </div>
        <ul className="space-y-3">
          {needsAttentionVisits.length === 0 ? (
            <li className="rounded-2xl border border-emerald-200/90 bg-emerald-50/50 px-4 py-6 text-center text-sm font-medium text-emerald-900 shadow-sm">
              Nothing is blocking this week. Great job staying current.
            </li>
          ) : (
            needsAttentionVisits.map((v) => {
              const pid = v.patient_id;
              const item = itemByVisit.get(v.id);
              const sd = typeof v.service_date === "string" ? v.service_date : null;
              const contractMissing = Boolean(sd && contractByServiceDate.get(sd) === false);
              const locked = isVisitRowLocked(v, item);
              return (
                <PayrollVisitRow
                  key={v.id}
                  visit={v}
                  patientName={pid ? patientLabel.get(pid) ?? null : null}
                  grossAmount={item ? Number(item.gross_amount ?? 0) : null}
                  itemStatus={item?.status ?? null}
                  payoutRoute={item?.payout_route ?? null}
                  inCurrentPeriod={visitInPeriod(v)}
                  contractMissing={contractMissing}
                  showReasons
                  variant="amber"
                  actions={
                    <VisitRowActions
                      visitId={v.id}
                      locked={locked}
                      canEndVisit={canEndVisitRow(v, locked)}
                      showRequestReview={!locked}
                    />
                  }
                />
              );
            })
          )}
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-sky-900">Submitted</h2>
          <p className="text-xs text-slate-500">Awaiting pay · includes any open batch you submitted to</p>
        </div>
        <ul className="space-y-3">
          {submittedItems.length === 0 ? (
            <li className="rounded-2xl border border-slate-200/90 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
              You have not submitted payroll for this period yet.
            </li>
          ) : (
            submittedItems.map((i) => {
              const v = visitMap.get(i.visit_id);
              if (!v) return null;
              const pid = v.patient_id;
              const batch = firstEmbed(i.payroll_batches);
              const batchLabel = batch?.pay_date
                ? `Pay date ${batch.pay_date} · Batch ${batch.status ?? "submitted"}`
                : `Batch ${batch?.status ?? "submitted"}`;
              const locked = isVisitRowLocked(v, i);
              return (
                <PayrollVisitRow
                  key={i.id}
                  visit={v}
                  patientName={pid ? patientLabel.get(pid) ?? null : null}
                  grossAmount={Number(i.gross_amount ?? 0)}
                  itemStatus={i.status}
                  payoutRoute={i.payout_route}
                  inCurrentPeriod={visitInPeriod(v)}
                  contractMissing={false}
                  showReasons={false}
                  variant="default"
                  batchLabel={batchLabel}
                  hideEligibilityLine
                  actions={
                    <VisitRowActions
                      visitId={v.id}
                      locked={locked}
                      canEndVisit={canEndVisitRow(v, locked)}
                      showRequestReview={false}
                    />
                  }
                />
              );
            })
          )}
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Paid history</h2>
          <p className="text-xs text-slate-500">Recent finalized lines</p>
        </div>
        <ul className="space-y-3">
          {paidHistoryItems.length === 0 ? (
            <li className="rounded-2xl border border-slate-200/90 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
              No paid lines yet — they will appear after payroll marks your batch paid.
            </li>
          ) : (
            paidHistoryItems.map((i) => {
              const v = visitMap.get(i.visit_id);
              if (!v) return null;
              const pid = v.patient_id;
              const batch = firstEmbed(i.payroll_batches);
              const batchLabel = batch?.pay_date
                ? `Paid · Pay date ${batch.pay_date} · ${batch.status === "paid" ? "Paid" : (batch.status ?? "")}`
                : "Paid";
              const locked = isVisitRowLocked(v, i);
              return (
                <PayrollVisitRow
                  key={i.id}
                  visit={v}
                  patientName={pid ? patientLabel.get(pid) ?? null : null}
                  grossAmount={Number(i.gross_amount ?? 0)}
                  itemStatus={i.status}
                  payoutRoute={i.payout_route}
                  inCurrentPeriod={visitInPeriod(v)}
                  contractMissing={false}
                  showReasons={false}
                  variant="default"
                  batchLabel={batchLabel}
                  hideEligibilityLine
                  actions={
                    <VisitRowActions
                      visitId={v.id}
                      locked={locked}
                      canEndVisit={false}
                      showRequestReview={false}
                    />
                  }
                />
              );
            })
          )}
        </ul>
      </section>
    </>
  );
}
