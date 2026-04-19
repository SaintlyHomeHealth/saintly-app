"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ArrowLeft } from "lucide-react";

import {
  adminAddNurseBillingLineAction,
  adminApproveAndMarkPaidAction,
  adminDeleteNurseBillingLineAction,
  adminUpdateNurseBillingLineAction,
} from "@/app/admin/payroll/nurse-billing-actions";
import { BILLING_LINE_TYPES, billingLineLabel, type BillingLineType } from "@/app/workspace/pay/self-billing-types";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type NurseBillingDetailLineVM = {
  id: string;
  patientId: string;
  patientName: string;
  serviceDate: string;
  lineType: string;
  amount: number;
  notes: string | null;
};

type Props = {
  billingId: string;
  employeeName: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: "draft" | "submitted" | "paid";
  submittedAt: string | null;
  paidAt: string | null;
  weeklyTotal: number;
  ytdPaid: number;
  lines: NurseBillingDetailLineVM[];
  patientOptions: { id: string; label: string }[];
  canEditLines: boolean;
  canApprove: boolean;
};

function StatusBadge({ status }: { status: Props["status"] }) {
  if (status === "draft") {
    return <span className="rounded-full bg-slate-200/90 px-3 py-1 text-xs font-bold uppercase text-slate-800">Draft</span>;
  }
  if (status === "submitted") {
    return <span className="rounded-full bg-sky-200/90 px-3 py-1 text-xs font-bold uppercase text-sky-950">Submitted</span>;
  }
  return <span className="rounded-full bg-emerald-200/90 px-3 py-1 text-xs font-bold uppercase text-emerald-950">Paid</span>;
}

export function NurseBillingDetail({
  billingId,
  employeeName,
  payPeriodStart,
  payPeriodEnd,
  status,
  submittedAt,
  paidAt,
  weeklyTotal,
  ytdPaid,
  lines,
  patientOptions,
  canEditLines,
  canApprove,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveMsg, setApproveMsg] = useState<string | null>(null);

  const [addPatientId, setAddPatientId] = useState("");
  const [addDate, setAddDate] = useState(payPeriodStart);
  const [addType, setAddType] = useState<BillingLineType>("visit");
  const [addAmount, setAddAmount] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const locked = status === "paid";

  const sortedPatients = useMemo(() => {
    return [...patientOptions].sort((a, b) => a.label.localeCompare(b.label));
  }, [patientOptions]);

  function onApprove() {
    setError(null);
    setApproveMsg(null);
    startTransition(async () => {
      const r = await adminApproveAndMarkPaidAction(billingId);
      if (r.ok) {
        setApproveMsg("Marked paid. This week is now locked.");
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/payroll?week=${encodeURIComponent(payPeriodStart)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:text-sky-700"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Payroll inbox
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}
      {approveMsg ? (
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
          {approveMsg}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-sky-100/90 bg-gradient-to-b from-white via-sky-50/25 to-white p-6 shadow-[0_24px_60px_-28px_rgba(30,58,138,0.2)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-800/80">Weekly invoice</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{employeeName}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Week {payPeriodStart} – {payPeriodEnd}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {locked ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Locked
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 text-sm shadow-inner shadow-slate-950/5 sm:min-w-[260px]">
            <div className="flex justify-between gap-6">
              <span className="text-slate-500">This week</span>
              <span className="font-bold tabular-nums text-slate-900">{money(weeklyTotal)}</span>
            </div>
            <div className="flex justify-between gap-6 border-t border-slate-100 pt-3">
              <span className="text-slate-500">YTD paid (calendar year)</span>
              <span className="font-bold tabular-nums text-slate-900">{money(ytdPaid)}</span>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid gap-4 border-t border-slate-100 pt-8 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {submittedAt ? new Date(submittedAt).toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</dt>
            <dd className="mt-1 font-medium text-slate-800">{paidAt ? new Date(paidAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Lines */}
      <section>
        <div className="mb-4 flex flex-col gap-1 border-b border-slate-200/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Billed lines</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Details</h2>
          </div>
          {canApprove && status === "submitted" ? (
            <button
              type="button"
              disabled={pending}
              onClick={onApprove}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Approve and mark paid"}
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,0.16)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3.5 sm:pl-5">Service date</th>
                  <th className="px-3 py-3.5">Patient</th>
                  <th className="px-3 py-3.5">Type</th>
                  <th className="px-3 py-3.5 text-right">Amount</th>
                  <th className="px-3 py-3.5">Notes</th>
                  {canEditLines ? <th className="w-28 px-3 py-3.5 sm:pr-5" /> : null}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={canEditLines ? 6 : 5} className="px-5 py-14 text-center text-sm text-slate-500">
                      No lines on this invoice yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) =>
                    editingId === line.id && canEditLines ? (
                      <EditLineRow
                        key={line.id}
                        billingId={billingId}
                        line={line}
                        patients={sortedPatients}
                        payPeriodStart={payPeriodStart}
                        payPeriodEnd={payPeriodEnd}
                        onCancel={() => setEditingId(null)}
                        onSaved={(err) => {
                          if (err) setError(err);
                          else {
                            setError(null);
                            setEditingId(null);
                            router.refresh();
                          }
                        }}
                      />
                    ) : (
                      <tr key={line.id} className="border-b border-slate-100/90 last:border-0">
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 sm:pl-5">{line.serviceDate}</td>
                        <td className="px-3 py-3.5 font-medium text-slate-900">{line.patientName}</td>
                        <td className="px-3 py-3.5 text-slate-700">{billingLineLabel(line.lineType)}</td>
                        <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">{money(line.amount)}</td>
                        <td className="max-w-[14rem] px-3 py-3.5 text-xs text-slate-600">{line.notes ?? "—"}</td>
                        {canEditLines ? (
                          <td className="whitespace-nowrap px-3 py-3 sm:pr-5">
                            <button
                              type="button"
                              className="text-xs font-semibold text-sky-700 hover:underline"
                              onClick={() => setEditingId(line.id)}
                            >
                              Edit
                            </button>
                            <span className="mx-2 text-slate-300">|</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-700 hover:underline"
                              onClick={() => {
                                if (!window.confirm("Delete this line?")) return;
                                setError(null);
                                startTransition(async () => {
                                  const r = await adminDeleteNurseBillingLineAction({ billingId, lineId: line.id });
                                  if (r.ok) router.refresh();
                                  else setError(r.error);
                                });
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Add line */}
      {canEditLines ? (
        <section className="rounded-[22px] border border-sky-100/90 bg-gradient-to-b from-white to-slate-50/40 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800/80">Add line</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Manual adjustment</h2>
          <p className="mt-1 text-xs text-slate-600">Service date must fall within this pay week.</p>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addPatientId) {
                setError("Select a patient.");
                return;
              }
              setError(null);
              startTransition(async () => {
                const r = await adminAddNurseBillingLineAction({
                  billingId,
                  patientId: addPatientId,
                  serviceDate: addDate,
                  lineType: addType,
                  amount: addAmount,
                  notes: addNotes,
                });
                if (r.ok) {
                  setAddAmount("");
                  setAddNotes("");
                  router.refresh();
                } else setError(r.error);
              });
            }}
          >
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Patient</label>
              <select
                value={addPatientId}
                onChange={(e) => setAddPatientId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                required
              >
                <option value="">Select…</option>
                {sortedPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Service date</label>
              <input
                type="date"
                min={payPeriodStart}
                max={payPeriodEnd}
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as BillingLineType)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                {BILLING_LINE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Amount</label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-medium"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Notes</label>
              <textarea
                rows={2}
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add line"}
              </button>
            </div>
          </form>
        </section>
      ) : locked ? (
        <p className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          This week is paid and locked. Lines cannot be edited from here.
        </p>
      ) : null}
    </div>
  );
}

function EditLineRow({
  billingId,
  line,
  patients,
  payPeriodStart,
  payPeriodEnd,
  onCancel,
  onSaved,
}: {
  billingId: string;
  line: NurseBillingDetailLineVM;
  patients: { id: string; label: string }[];
  payPeriodStart: string;
  payPeriodEnd: string;
  onCancel: () => void;
  onSaved: (err?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(line.patientId);
  const [serviceDate, setServiceDate] = useState(line.serviceDate);
  const [lineType, setLineType] = useState<BillingLineType>(
    (BILLING_LINE_TYPES.some((t) => t.value === line.lineType) ? line.lineType : "visit") as BillingLineType
  );
  const [amount, setAmount] = useState(
    line.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [notes, setNotes] = useState(line.notes ?? "");

  return (
    <tr className="border-b border-sky-100 bg-sky-50/50">
      <td colSpan={6} className="px-4 py-5 sm:px-5">
        <p className="text-xs font-semibold text-sky-900">Edit line</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Service date</label>
            <input
              type="date"
              min={payPeriodStart}
              max={payPeriodEnd}
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Type</label>
            <select
              value={lineType}
              onChange={(e) => setLineType(e.target.value as BillingLineType)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {BILLING_LINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Amount</label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => {
                  const n = Number.parseFloat(amount.trim());
                  if (Number.isFinite(n) && n >= 0) {
                    setAmount((Math.round(n * 100) / 100).toFixed(2));
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-7 pr-3 text-sm font-medium"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await adminUpdateNurseBillingLineAction({
                  billingId,
                  lineId: line.id,
                  patientId,
                  serviceDate,
                  lineType,
                  amount,
                  notes,
                });
                onSaved(r.ok ? undefined : r.error);
              });
            }}
            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
