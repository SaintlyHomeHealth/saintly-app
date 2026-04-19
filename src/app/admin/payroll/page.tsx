import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { loadContractForServiceDate } from "@/lib/payroll/contract-for-date";
import { computeVisitGrossPay } from "@/lib/payroll/compute-payable";
import { fetchYtdPaidTotalsByEmployee } from "@/lib/payroll/nurse-billing-ytd";
import { getPayPeriodForDate } from "@/lib/payroll/pay-period";
import { payrollComplianceFlags } from "@/lib/payroll/compliance";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher, isPayrollApprover } from "@/lib/staff-profile";

import {
  createPayrollVisitAction,
  holdPayrollVisitAction,
  markPayrollBatchPaidAction,
  resolvePayrollExceptionAction,
  setBatchExportStubAction,
} from "./actions";
import { NursePayrollInbox } from "./NursePayrollInbox";
import { PayrollCompleteVisitForm } from "./PayrollCompleteVisitForm";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const approver = isPayrollApprover(staff);
  const now = new Date();
  const defaultPeriod = getPayPeriodForDate(now);
  const sp = await searchParams;
  const weekRaw = typeof sp?.week === "string" ? sp.week.trim() : "";
  let selectedPeriod = defaultPeriod;
  if (/^\d{4}-\d{2}-\d{2}$/.test(weekRaw)) {
    const parsed = new Date(`${weekRaw}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      selectedPeriod = getPayPeriodForDate(parsed);
    }
  }

  const [
    { data: visits },
    { data: applicants },
    { data: batches },
    { data: items },
    { data: nurseBillingsFull },
    { data: nurseBillingPeriodRows },
  ] = await Promise.all([
    supabaseAdmin.from("visits").select("*").order("service_date", { ascending: false }).limit(400),
    supabaseAdmin
      .from("applicants")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .limit(500),
    supabaseAdmin.from("payroll_batches").select("*").order("pay_period_start", { ascending: false }).limit(24),
    supabaseAdmin.from("payroll_visit_items").select("*").limit(2000),
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
      .eq("pay_period_start", selectedPeriod.payPeriodStart)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("nurse_weekly_billings")
      .select("pay_period_start, pay_period_end")
      .order("pay_period_start", { ascending: false })
      .limit(400),
  ]);

  const visitList = visits ?? [];
  const itemByVisit = new Map((items ?? []).map((i) => [i.visit_id, i]));

  const nurseLinePatientIds = new Set<string>();
  for (const nb of nurseBillingsFull ?? []) {
    const raw = nb.nurse_weekly_billing_lines;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const L of arr) {
      const pid = (L as { patient_id?: string | null }).patient_id;
      if (typeof pid === "string" && pid.trim()) nurseLinePatientIds.add(pid);
    }
  }

  const patientIds = [
    ...new Set([...visitList.map((v) => v.patient_id).filter(Boolean), ...nurseLinePatientIds]),
  ] as string[];
  const patientLabel = new Map<string, string>();
  if (patientIds.length > 0) {
    const { data: patientRows } = await supabaseAdmin
      .from("patients")
      .select("id, contacts(full_name, first_name, last_name)")
      .in("id", patientIds);
    for (const row of patientRows ?? []) {
      const raw = row.contacts as
        | { full_name?: string | null; first_name?: string | null; last_name?: string | null }
        | { full_name?: string | null; first_name?: string | null; last_name?: string | null }[]
        | null;
      const c = Array.isArray(raw) ? raw[0] : raw;
      const label =
        (typeof c?.full_name === "string" && c.full_name.trim()) ||
        [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
        "Patient";
      patientLabel.set(row.id, label);
    }
  }

  const previewByVisitId = new Map<string, number>();
  await Promise.all(
    visitList.map(async (v) => {
      const c = await loadContractForServiceDate(v.employee_id, v.service_date);
      const g = c
        ? computeVisitGrossPay(
            { pay_type: c.pay_type, pay_rate: c.pay_rate, contract_status: c.contract_status },
            v.check_in_time,
            v.check_out_time
          )
        : 0;
      previewByVisitId.set(v.id, g);
    })
  );

  const applicantMap = new Map((applicants ?? []).map((a) => [a.id, a] as const));

  const ytdByEmployee = await fetchYtdPaidTotalsByEmployee(new Date().getFullYear());

  const nursePayrollInboxRows = (nurseBillingsFull ?? []).map((nb) => {
    const raw = nb.nurse_weekly_billing_lines;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    let weeklyTotal = 0;
    for (const L of arr) {
      weeklyTotal += Number((L as { amount?: unknown }).amount ?? 0);
    }
    const emp = applicantMap.get(nb.employee_id);
    const employeeName = emp ? [emp.first_name, emp.last_name].filter(Boolean).join(" ") : String(nb.employee_id);
    const st = String(nb.status ?? "draft");
    const status: "draft" | "submitted" | "paid" =
      st === "submitted" || st === "paid" || st === "draft" ? st : "draft";
    return {
      billingId: String(nb.id),
      employeeName,
      weekStart: String(nb.pay_period_start ?? ""),
      weekEnd: String(nb.pay_period_end ?? ""),
      status,
      weeklyTotal,
      ytdPaid: ytdByEmployee.get(String(nb.employee_id)) ?? 0,
      submittedAt: typeof nb.submitted_at === "string" ? nb.submitted_at : null,
      paidAt: typeof nb.paid_at === "string" ? nb.paid_at : null,
    };
  });

  const seenPeriodStarts = new Set<string>();
  const periodOptions: { start: string; end: string; label: string }[] = [];
  for (const row of nurseBillingPeriodRows ?? []) {
    const s = row.pay_period_start;
    const e = row.pay_period_end;
    if (typeof s !== "string" || seenPeriodStarts.has(s)) continue;
    seenPeriodStarts.add(s);
    const end = typeof e === "string" ? e : s;
    periodOptions.push({
      start: s,
      end,
      label: `${s} – ${end}`,
    });
  }
  if (!periodOptions.some((o) => o.start === selectedPeriod.payPeriodStart)) {
    periodOptions.unshift({
      start: selectedPeriod.payPeriodStart,
      end: selectedPeriod.payPeriodEnd,
      label: `${selectedPeriod.payPeriodStart} – ${selectedPeriod.payPeriodEnd}`,
    });
  }
  periodOptions.sort((a, b) => b.start.localeCompare(a.start));

  /** Calendar “this week” for legacy synced batches (not the optional nurse-billing week filter). */
  const calendarPeriod = getPayPeriodForDate(new Date());
  const currentBatch = (batches ?? []).find(
    (b) => b.pay_period_start === calendarPeriod.payPeriodStart && b.pay_period_end === calendarPeriod.payPeriodEnd
  );

  const batchItems = currentBatch
    ? (items ?? []).filter((i) => i.payroll_batch_id === currentBatch.id)
    : [];
  const w2 = batchItems.filter((i) => i.payout_route === "w2").reduce((s, i) => s + Number(i.gross_amount ?? 0), 0);
  const c1099 = batchItems
    .filter((i) => i.payout_route === "contractor_1099")
    .reduce((s, i) => s + Number(i.gross_amount ?? 0), 0);

  const exceptions = visitList.filter((v) => v.requires_review || v.status === "held");

  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
        <AdminPageHeader
          accent="indigo"
          eyebrow="Payroll center"
          title="Weekly payroll"
          description="Approve nurse weekly invoices at the top. Expand legacy tools below only when you need synced visits, exceptions, or batch export."
        />

        <div className="mt-8">
          <NursePayrollInbox
            selectedWeekStart={selectedPeriod.payPeriodStart}
            periodOptions={periodOptions.map((o) => ({ start: o.start, label: o.label }))}
            rows={nursePayrollInboxRows}
          />
        </div>

        <details className="mt-14 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 open:bg-white sm:p-6">
          <summary className="cursor-pointer list-none rounded-xl outline-none ring-sky-400/30 focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Legacy payroll</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Synced visits &amp; batch export</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              Automatic visit lines, exception review, and weekly batch tooling. This is separate from nurse invoice approval
              above.
            </p>
            <p className="mt-3 text-xs font-semibold text-sky-800">Click to expand</p>
          </summary>

        <div className="mt-8 space-y-10 border-t border-slate-200/80 pt-10">
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50/90 to-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-800">Current pay period</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {calendarPeriod.payPeriodStart} → {calendarPeriod.payPeriodEnd}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Submit by {new Date(calendarPeriod.submissionDeadline).toLocaleString()} · Pay {calendarPeriod.payDate}
            </p>
            {currentBatch ? (
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Batch status: <span className="text-sky-900">{currentBatch.status}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No batch row yet — it is created when someone submits.</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">This batch routing</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">W-2 (payroll export)</p>
                <p className="text-lg font-bold text-slate-900">{money(w2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">1099 (contractor)</p>
                <p className="text-lg font-bold text-slate-900">{money(c1099)}</p>
              </div>
            </div>
            {currentBatch && approver ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={markPayrollBatchPaidAction}>
                  <input type="hidden" name="batchId" value={currentBatch.id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Mark batch paid
                  </button>
                </form>
                <form action={setBatchExportStubAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="batchId" value={currentBatch.id} />
                  <input type="hidden" name="externalProvider" value="quickbooks" />
                  <input
                    name="externalBatchId"
                    placeholder="External batch ID"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    Save export IDs
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800">Exceptions (review)</h2>
          <div className="mt-3 space-y-3">
            {exceptions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No flagged visits.
              </p>
            ) : (
              exceptions.map((v) => {
                const emp = applicantMap.get(v.employee_id);
                const name = emp ? [emp.first_name, emp.last_name].filter(Boolean).join(" ") : v.employee_id;
                const flags = payrollComplianceFlags(v);
                const item = itemByVisit.get(v.id);
                return (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-amber-200/90 bg-amber-50/50 p-4 shadow-sm"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {name} · {v.visit_type}{" "}
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase text-slate-700">
                            {v.status}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600">{v.service_date}</p>
                        <ul className="mt-2 flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <li
                              key={f}
                              className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                            >
                              {f}
                            </li>
                          ))}
                        </ul>
                        {item ? (
                          <p className="mt-2 text-xs text-slate-600">
                            Line: {item.status} · {item.payout_route} · {money(Number(item.gross_amount ?? 0))}
                          </p>
                        ) : null}
                      </div>
                      <form action={resolvePayrollExceptionAction} className="shrink-0">
                        <input type="hidden" name="visitId" value={v.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Re-sync visit
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payroll batches</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Pay date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Export</th>
                  <th className="px-4 py-3">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(batches ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No batches yet.
                    </td>
                  </tr>
                ) : (
                  (batches ?? []).map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {b.pay_period_start} – {b.pay_period_end}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{b.pay_date}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-700">
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {b.export_status ?? "—"}
                        {b.external_batch_id ? ` · ${b.external_batch_id}` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {b.paid_at ? new Date(b.paid_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Create visit</h2>
          <form
            action={createPayrollVisitAction}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
          >
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
              Employee (applicant)
              <select
                name="employeeId"
                required
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {(applicants ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || a.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs font-semibold text-slate-600">
              Service date
              <input
                name="serviceDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs font-semibold text-slate-600">
              Visit type
              <input
                name="visitType"
                defaultValue="visit"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/20"
            >
              Add visit
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Visits</h2>
          <div className="mt-3 space-y-4">
            {visitList.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                No visits yet.
              </p>
            ) : (
              visitList.map((v) => {
                const emp = applicantMap.get(v.employee_id);
                const empName = emp ? [emp.first_name, emp.last_name].filter(Boolean).join(" ") : v.employee_id;
                const pName = v.patient_id ? patientLabel.get(v.patient_id) ?? "Patient" : "—";
                const flags = payrollComplianceFlags(v);
                const preview = previewByVisitId.get(v.id) ?? 0;
                const item = itemByVisit.get(v.id);

                return (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-200/30"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-slate-900">
                          {v.visit_type}{" "}
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                            {v.status}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">{empName}</span>
                          {" · "}
                          DOS {v.service_date} · Patient: {pName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {v.check_in_time && v.check_out_time
                            ? `${new Date(v.check_in_time).toLocaleString()} → ${new Date(v.check_out_time).toLocaleString()}`
                            : "Times not set"}
                          {" · "}
                          Note: {v.note_completed ? "yes" : "no"}
                        </p>
                        {v.patient_id ? (
                          <Link
                            href={`/admin/crm/patients/${v.patient_id}`}
                            className="inline-block text-xs font-semibold text-sky-700 hover:underline"
                          >
                            Open patient
                          </Link>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot / line</p>
                        <p className="text-lg font-bold text-slate-900">
                          {item ? money(Number(item.gross_amount ?? 0)) : money(preview)}
                        </p>
                        {item ? (
                          <p className="text-[11px] text-slate-500">
                            {item.status} · {item.payout_route === "w2" ? "W-2" : "1099"}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500">Preview {money(preview)}</p>
                        )}
                      </div>
                    </div>

                    {flags.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {flags.map((f) => (
                          <li
                            key={f}
                            className="rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[11px] font-medium text-emerald-700">No compliance flags</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {v.status === "completed" ? (
                        <form action={holdPayrollVisitAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="visitId" value={v.id} />
                          <input
                            name="heldReason"
                            placeholder="Hold reason"
                            className="min-w-[180px] rounded-xl border border-rose-200 bg-white px-2 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                          >
                            Hold
                          </button>
                        </form>
                      ) : null}
                    </div>

                    {v.status === "pending" || v.status === "held" ? <PayrollCompleteVisitForm visitId={v.id} /> : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
        </div>
        </details>
      </div>
    </>
  );
}
