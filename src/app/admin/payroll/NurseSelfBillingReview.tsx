"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChevronDown } from "lucide-react";

import { markNurseWeeklyBillingPaidAction } from "./actions";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type NurseBillingAdminLineVM = {
  id: string;
  patientName: string;
  serviceDate: string;
  lineTypeLabel: string;
  amount: number;
  notes: string | null;
};

export type NurseBillingAdminCardVM = {
  id: string;
  nurseName: string;
  status: "draft" | "submitted" | "paid";
  payPeriodStart: string;
  payPeriodEnd: string;
  submittedAt: string | null;
  paidAt: string | null;
  lineCount: number;
  total: number;
  lines: NurseBillingAdminLineVM[];
};

type PeriodOption = { start: string; end: string; label: string };

type Props = {
  selectedWeekStart: string;
  periodOptions: PeriodOption[];
  cards: NurseBillingAdminCardVM[];
  canMarkPaid: boolean;
};

function statusBadge(status: NurseBillingAdminCardVM["status"]) {
  if (status === "draft") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-800">
        Draft
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-950">
        Submitted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-200/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-950">
      Paid
    </span>
  );
}

export function NurseSelfBillingReview({
  selectedWeekStart,
  periodOptions,
  cards,
  canMarkPaid,
}: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="rounded-[24px] border border-sky-200/80 bg-gradient-to-b from-sky-50/90 via-white to-white p-6 shadow-[0_20px_50px_-24px_rgba(30,58,138,0.22)] sm:p-8">
      <div className="flex flex-col gap-4 border-b border-sky-100/90 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-800/80">Nurse invoices</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Weekly self-billing</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Nurses submit line items from <span className="font-medium text-slate-800">Workspace → Pay</span>. Review each
            invoice below, open to see every line, then mark paid when reconciled.
          </p>
        </div>

        <div className="shrink-0 lg:pt-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pay week</label>
          <select
            value={selectedWeekStart}
            onChange={(e) => {
              const v = e.target.value;
              router.replace(v ? `/admin/payroll?week=${encodeURIComponent(v)}` : "/admin/payroll");
            }}
            className="mt-1.5 min-w-[220px] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/25 focus:ring-2"
          >
            {periodOptions.map((o) => (
              <option key={o.start} value={o.start}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">Defaults to the current period; pick another week to review history.</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200/80 bg-white/80 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">No nurse self-billing for this week yet</p>
            <p className="mt-2 text-sm text-slate-500">
              When a nurse saves lines on Pay, their draft or submitted invoice will appear here.
            </p>
          </div>
        ) : (
          cards.map((card) => {
            const expanded = openId === card.id;
            return (
              <div
                key={card.id}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_36px_-18px_rgba(15,23,42,0.18)]"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{card.nurseName}</p>
                      {statusBadge(card.status)}
                    </div>
                    <p className="text-xs text-slate-600">
                      Week{" "}
                      <span className="font-medium text-slate-800">
                        {card.payPeriodStart} – {card.payPeriodEnd}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                      <span>
                        <span className="text-slate-500">Lines:</span>{" "}
                        <span className="font-semibold text-slate-800">{card.lineCount}</span>
                      </span>
                      <span>
                        <span className="text-slate-500">Total:</span>{" "}
                        <span className="font-bold tabular-nums text-slate-900">{money(card.total)}</span>
                      </span>
                      {card.submittedAt ? (
                        <span>
                          <span className="text-slate-500">Submitted:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {new Date(card.submittedAt).toLocaleString()}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500">Not submitted yet</span>
                      )}
                      {card.paidAt ? (
                        <span>
                          <span className="text-slate-500">Paid:</span>{" "}
                          <span className="font-medium text-emerald-900">{new Date(card.paidAt).toLocaleString()}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => setOpenId(expanded ? null : card.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-2.5 text-xs font-semibold text-sky-950 shadow-sm transition hover:bg-sky-100/90"
                    >
                      {expanded ? "Hide line items" : "View line items"}
                      <ChevronDown
                        className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
                        strokeWidth={2}
                        aria-hidden
                      />
                    </button>

                    {canMarkPaid && card.status === "submitted" ? (
                      <form action={markNurseWeeklyBillingPaidAction}>
                        <input type="hidden" name="billingId" value={card.id} />
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-500 sm:w-auto"
                        >
                          Mark self-billing paid
                        </button>
                      </form>
                    ) : null}

                    {/* TODO: wire to returnNurseSelfBillingToDraftAction when product is ready */}
                    {canMarkPaid && card.status === "submitted" ? (
                      <button
                        type="button"
                        disabled
                        title="Coming soon: send back for correction"
                        className="cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400"
                      >
                        Return to draft
                      </button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-5 pt-2 sm:px-5">
                    <p className="py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Line items</p>
                    {card.lines.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                        No lines on this invoice yet.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                <th className="px-4 py-3">Patient</th>
                                <th className="px-3 py-3">Service date</th>
                                <th className="px-3 py-3">Type</th>
                                <th className="px-3 py-3 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {card.lines.map((line) => (
                                <tr key={line.id}>
                                  <td className="max-w-[200px] px-4 py-3 align-top">
                                    <span className="font-medium text-slate-900">{line.patientName}</span>
                                    {line.notes?.trim() ? (
                                      <p className="mt-1 text-xs leading-snug text-slate-500">Note: {line.notes}</p>
                                    ) : null}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{line.serviceDate}</td>
                                  <td className="px-3 py-3 text-slate-700">{line.lineTypeLabel}</td>
                                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                                    {money(line.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-200 bg-slate-50/90">
                                <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                                  Invoice total
                                </td>
                                <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-slate-900">
                                  {money(card.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {statusBadge(card.status)}
                      <span className="text-xs text-slate-500">
                        {card.lineCount} line{card.lineCount === 1 ? "" : "s"} · {money(card.total)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
