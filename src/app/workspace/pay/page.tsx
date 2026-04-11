import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getPayPeriodForDate, serviceDateInPeriod } from "@/lib/payroll/pay-period";
import { payrollComplianceFlags } from "@/lib/payroll/compliance";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

import { SubmitWeeklyPayrollButton } from "./SubmitWeeklyPayrollButton";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
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

  const [{ data: items }, { data: visitRows }, { data: earningsRow }, { data: batchRows }] = await Promise.all([
    supabase
      .from("payroll_visit_items")
      .select("id, gross_amount, status, payout_route, payroll_batch_id, visit_id")
      .eq("employee_id", applicantId),
    supabase
      .from("visits")
      .select(
        "id, visit_type, status, service_date, check_in_time, check_out_time, note_completed, requires_review, held_reason, created_at"
      )
      .eq("employee_id", applicantId)
      .order("service_date", { ascending: false })
      .limit(80),
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
  ]);

  const visits = visitRows ?? [];
  const itemByVisit = new Map((items ?? []).map((i) => [i.visit_id, i]));

  const eligibleReady = (items ?? []).filter(
    (i) =>
      i.status === "ready" &&
      !i.payroll_batch_id &&
      visits.some((v) => {
        if (v.id !== i.visit_id) return false;
        const sd = typeof v.service_date === "string" ? v.service_date : null;
        return sd && serviceDateInPeriod(sd, bounds.payPeriodStart, bounds.payPeriodEnd);
      })
  );

  const estimated = eligibleReady.reduce((s, i) => s + Number(i.gross_amount ?? 0), 0);

  const exceptions = visits.filter((v) => v.requires_review || v.status === "held");

  const ytd = Number(earningsRow?.ytd_earnings ?? 0);
  const paid = Number(earningsRow?.total_paid ?? 0);
  const pendingE = Number(earningsRow?.total_pending ?? 0);

  const deadline = new Date(bounds.submissionDeadline);
  const canSubmit = estimated > 0;

  return (
    <>
      <AdminPageHeader
        accent="sky"
        eyebrow="Workspace"
        title="Payroll center"
        metaLine={`Pay period ${bounds.payPeriodStart} – ${bounds.payPeriodEnd}`}
        description={`Submit by ${deadline.toLocaleString()}. Pay date ${bounds.payDate}. Normal visits that meet all checks appear here automatically; only exceptions need payroll review.`}
        footer={
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-3 sm:px-8">
            <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Est. this period</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{money(estimated)}</p>
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
        }
        actions={<SubmitWeeklyPayrollButton disabled={!canSubmit} />}
      />

      {batchRows?.id ? (
        <p className="mt-4 text-sm text-slate-600">
          Batch status: <span className="font-semibold text-slate-900">{batchRows.status}</span>
        </p>
      ) : null}

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">This week (eligible)</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40">
          {eligibleReady.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No ready visits for this period yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {eligibleReady.map((i) => {
                const v = visits.find((x) => x.id === i.visit_id);
                return (
                  <li key={i.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{v?.visit_type ?? "Visit"}</p>
                        <p className="text-xs text-slate-500">
                          {v?.service_date} · {i.payout_route === "w2" ? "W-2" : "1099"}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{money(Number(i.gross_amount ?? 0))}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800">Exceptions &amp; holds</h2>
        <div className="overflow-hidden rounded-2xl border border-amber-200/90 bg-amber-50/40 shadow-sm">
          {exceptions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">No exceptions — you&apos;re all set.</p>
          ) : (
            <ul className="divide-y divide-amber-100">
              {exceptions.map((v) => {
                const flags = payrollComplianceFlags(v);
                return (
                  <li key={v.id} className="px-4 py-4 sm:px-5">
                    <p className="text-sm font-semibold text-slate-900">
                      {v.visit_type}{" "}
                      <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600">
                        {v.status}
                      </span>
                    </p>
                    {v.held_reason ? (
                      <p className="mt-1 text-xs text-rose-800">Hold: {v.held_reason}</p>
                    ) : null}
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {flags.map((f) => (
                        <li
                          key={f}
                          className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent activity</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {visits.slice(0, 15).map((v) => {
              const item = itemByVisit.get(v.id);
              return (
                <li key={v.id} className="px-4 py-3 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">{v.service_date}</span> · {v.visit_type} ·{" "}
                  <span className="text-slate-500">{v.status}</span>
                  {item ? (
                    <span className="ml-2 text-xs text-slate-500">
                      Line: {item.status} · {money(Number(item.gross_amount ?? 0))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
