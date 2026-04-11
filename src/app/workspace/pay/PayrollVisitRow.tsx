import Link from "next/link";
import type { ReactNode } from "react";

import type { PayrollVisitLike } from "@/lib/payroll/compliance";
import { checkInOutSummary, getEmployeePayrollReasons, noteSummary } from "@/lib/payroll/employee-reasons";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatVisitType(raw: string | null | undefined): string {
  const s = (raw ?? "Visit").trim();
  if (!s) return "Visit";
  return s
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatVisitStatus(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending";
  if (status === "held") return "Held";
  if (status === "paid") return "Paid";
  return status;
}

function formatItemStatus(status: string | null | undefined): string {
  if (!status) return "—";
  if (status === "ready") return "Ready";
  if (status === "draft") return "Draft";
  if (status === "submitted") return "Submitted";
  if (status === "paid") return "Paid";
  if (status === "void") return "Blocked";
  return status;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export type PayrollVisitRowProps = {
  visit: PayrollVisitLike & {
    id: string;
    visit_type: string;
    service_date: string | null;
    status: string;
    held_reason?: string | null;
    requires_review?: boolean | null;
    visit_duration_minutes?: number | null;
  };
  patientName: string | null;
  grossAmount: number | null;
  itemStatus: string | null;
  payoutRoute: string | null;
  inCurrentPeriod: boolean;
  contractMissing: boolean;
  showReasons?: boolean;
  variant?: "default" | "amber" | "sky";
  batchLabel?: string | null;
  hideEligibilityLine?: boolean;
  actions?: ReactNode;
};

export function PayrollVisitRow({
  visit: v,
  patientName,
  grossAmount,
  itemStatus,
  payoutRoute,
  inCurrentPeriod,
  contractMissing,
  showReasons,
  variant = "default",
  batchLabel,
  hideEligibilityLine,
  actions,
}: PayrollVisitRowProps) {
  const reasons = showReasons
    ? getEmployeePayrollReasons(
        {
          ...v,
          service_date: v.service_date,
          status: v.status,
          held_reason: v.held_reason ?? null,
        },
        { inCurrentPeriod, contractMissing }
      )
    : [];

  const shell =
    variant === "amber"
      ? "border-amber-200/90 bg-amber-50/35"
      : variant === "sky"
        ? "border-sky-200/90 bg-sky-50/40"
        : "border-slate-200/90 bg-white";

  const payrollLabel = itemStatus
    ? `${formatItemStatus(itemStatus)}${payoutRoute ? ` · ${payoutRoute === "w2" ? "W-2" : "1099"}` : ""}`
    : "No line yet";

  return (
    <li className={`rounded-2xl border px-4 py-4 shadow-sm sm:px-5 ${shell}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 lg:col-span-2">
          <p className="truncate text-sm font-bold text-slate-900">{patientName ? patientName : "Patient"}</p>
          <p className="text-xs text-slate-600">
            {formatVisitType(v.visit_type)} · {formatVisitStatus(v.status)}
            {typeof v.visit_duration_minutes === "number" && v.visit_duration_minutes >= 0 ? (
              <span className="text-slate-400"> · {v.visit_duration_minutes} min on site</span>
            ) : null}
          </p>
        </div>
        <div className="text-xs sm:text-right lg:text-left">
          <p className="font-semibold text-slate-500">Service date</p>
          <p className="font-medium text-slate-900">{v.service_date ?? "—"}</p>
        </div>
        <div className="text-xs sm:text-right lg:text-left">
          <p className="font-semibold text-slate-500">Gross</p>
          <p className="text-base font-bold tabular-nums text-slate-900">{grossAmount !== null ? money(grossAmount) : "—"}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="font-semibold text-slate-500">Check-in </span>
          <span className="text-slate-900">{fmtTime(v.check_in_time)}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-500">Check-out </span>
          <span className="text-slate-900">{fmtTime(v.check_out_time)}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-500">Note </span>
          <span className={v.note_completed ? "text-emerald-800" : "text-amber-900"}>{noteSummary(v.note_completed)}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-500">Payroll </span>
          <span className="text-slate-900">{payrollLabel}</span>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-600">{checkInOutSummary(v)}</p>

      {batchLabel ? (
        <p className="mt-2 text-[11px] font-medium text-slate-600">{batchLabel}</p>
      ) : hideEligibilityLine ? null : inCurrentPeriod ? (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">This week&apos;s pay period</p>
      ) : (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outside current pay period</p>
      )}

      {v.held_reason ? (
        <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
          <span className="font-semibold">From office: </span>
          {v.held_reason}
        </p>
      ) : null}

      {showReasons && reasons.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <li
              key={r}
              className="rounded-full border border-amber-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 shadow-sm"
            >
              {r}
            </li>
          ))}
        </ul>
      ) : null}

      {showReasons ? (
        <details className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-sky-900">What to fix</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
            {reasons.length > 0 ? (
              reasons.map((r) => <li key={r}>{r}</li>)
            ) : (
              <li>Complete documentation in Alora, then refresh payroll status.</li>
            )}
          </ul>
        </details>
      ) : null}

      {actions ? <div className="mt-3 border-t border-slate-100 pt-3">{actions}</div> : null}

      {showReasons ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/workspace/phone/today"
            className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50"
          >
            Open workspace
          </Link>
        </div>
      ) : null}
    </li>
  );
}
