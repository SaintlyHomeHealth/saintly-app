"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronRight } from "lucide-react";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type NursePayrollInboxRow = {
  billingId: string;
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  status: "draft" | "submitted" | "paid";
  weeklyTotal: number;
  ytdPaid: number;
  submittedAt: string | null;
  paidAt: string | null;
};

type PeriodOpt = { start: string; label: string };

type Props = {
  selectedWeekStart: string;
  periodOptions: PeriodOpt[];
  rows: NursePayrollInboxRow[];
};

function Badge({ status }: { status: NursePayrollInboxRow["status"] }) {
  if (status === "draft") {
    return <span className="rounded-full bg-slate-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase text-slate-800">Draft</span>;
  }
  if (status === "submitted") {
    return <span className="rounded-full bg-sky-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase text-sky-950">Submitted</span>;
  }
  return <span className="rounded-full bg-emerald-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-950">Paid</span>;
}

export function NursePayrollInbox({ selectedWeekStart, periodOptions, rows }: Props) {
  const router = useRouter();

  return (
    <section className="rounded-[24px] border border-sky-100/90 bg-gradient-to-b from-white via-sky-50/30 to-white p-6 shadow-[0_24px_60px_-28px_rgba(30,58,138,0.2)] sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-800/80">Invoice approval</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Weekly nurse payroll</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Open an employee to review lines, adjust before payment, then approve and mark paid.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pay week</label>
          <select
            value={selectedWeekStart}
            onChange={(e) => {
              const v = e.target.value;
              router.replace(v ? `/admin/payroll?week=${encodeURIComponent(v)}` : "/admin/payroll");
            }}
            className="mt-1.5 min-w-[240px] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-950/5"
          >
            {periodOptions.map((o) => (
              <option key={o.start} value={o.start}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200/80 bg-white/90 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">No invoices for this week</p>
            <p className="mt-2 text-sm text-slate-500">When nurses create payroll in Workspace → Pay, they will appear here.</p>
          </div>
        ) : (
          rows.map((row) => (
            <Link
              key={row.billingId}
              href={`/admin/payroll/nurse/${row.billingId}`}
              className="group flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-sky-300/80 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-slate-900">{row.employeeName}</p>
                  <Badge status={row.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Week {row.weekStart} – {row.weekEnd}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                  <span>
                    <span className="text-slate-500">This week:</span>{" "}
                    <span className="font-semibold text-slate-900">{money(row.weeklyTotal)}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">YTD paid:</span>{" "}
                    <span className="font-semibold text-slate-900">{money(row.ytdPaid)}</span>
                  </span>
                  {row.submittedAt ? (
                    <span>
                      <span className="text-slate-500">Submitted:</span>{" "}
                      {new Date(row.submittedAt).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-slate-500">Not submitted</span>
                  )}
                  {row.paidAt ? (
                    <span>
                      <span className="text-slate-500">Paid:</span>{" "}
                      {new Date(row.paidAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 group-hover:text-sky-600">
                Review
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
