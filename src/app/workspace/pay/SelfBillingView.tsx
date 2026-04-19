"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addSelfBillingLineAction,
  deleteSelfBillingLineAction,
  submitSelfBillingWeekAction,
  updateSelfBillingLineAction,
} from "./self-billing-actions";
import { BILLING_LINE_TYPES, billingLineLabel, type BillingLineType } from "./self-billing-types";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function defaultServiceDate(periodStart: string, periodEnd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today >= periodStart && today <= periodEnd) return today;
  return periodStart;
}

export type SelfBillingLineVM = {
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
  status: "draft" | "submitted" | "paid";
  payPeriodStart: string;
  payPeriodEnd: string;
  deadlineIso: string;
  /** Compared at request time on the server (see page.tsx). */
  deadlinePassed: boolean;
  lines: SelfBillingLineVM[];
  patients: { id: string; label: string }[];
};

export function SelfBillingView({
  billingId,
  status,
  payPeriodStart,
  payPeriodEnd,
  deadlineIso,
  deadlinePassed,
  lines,
  patients,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [patientQuery, setPatientQuery] = useState("");
  const [addPatientId, setAddPatientId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(() => defaultServiceDate(payPeriodStart, payPeriodEnd));
  const [addType, setAddType] = useState<BillingLineType>("visit");
  const [addAmount, setAddAmount] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 40);
    return patients.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 40);
  }, [patients, patientQuery]);

  const canEdit = status === "draft";
  const running = lines.reduce((s, l) => s + l.amount, 0);

  function onAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (!addPatientId) {
      setError("Select a patient.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addSelfBillingLineAction({
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
  }

  return (
    <div className="space-y-10">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      {/* 1. Add line */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Add visit / commission</h2>
        <form onSubmit={onAddLine} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Patient</label>
            <input
              type="search"
              autoComplete="off"
              placeholder="Search patients…"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:ring-2 disabled:bg-slate-50"
            />
            {addPatientId ? (
              <p className="mt-2 text-sm font-medium text-slate-900">
                Selected: {patients.find((p) => p.id === addPatientId)?.label ?? addPatientId}
                {canEdit ? (
                  <button
                    type="button"
                    className="ml-2 text-xs font-semibold text-sky-700 underline"
                    onClick={() => setAddPatientId(null)}
                  >
                    Clear
                  </button>
                ) : null}
              </p>
            ) : (
              <ul className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80">
                {filteredPatients.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-slate-500">No matches.</li>
                ) : (
                  filteredPatients.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          setAddPatientId(p.id);
                          setPatientQuery("");
                        }}
                        className="flex w-full px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-white disabled:opacity-50"
                      >
                        {p.label}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Date</label>
              <input
                type="date"
                required
                value={addDate}
                min={payPeriodStart}
                max={payPeriodEnd}
                onChange={(e) => setAddDate(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as BillingLineType)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50"
              >
                {BILLING_LINE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Notes (optional)</label>
            <textarea
              rows={2}
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-50"
            />
          </div>

          <button
            type="submit"
            disabled={!canEdit || pending}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {pending ? "Working…" : "Add line"}
          </button>
        </form>
      </section>

      {/* 2. Entries */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Entries</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 sm:px-4">Patient</th>
                <th className="px-3 py-3 sm:px-4">Date</th>
                <th className="px-3 py-3 sm:px-4">Type</th>
                <th className="px-3 py-3 text-right sm:px-4">Amount</th>
                {canEdit ? <th className="w-28 px-3 py-3 sm:px-4" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-10 text-center text-slate-500">
                    No lines yet. Add a visit or commission above.
                  </td>
                </tr>
              ) : (
                lines.map((line) =>
                  editingId === line.id && canEdit ? (
                    <EditRow
                      key={line.id}
                      billingId={billingId}
                      line={line}
                      patients={patients}
                      payPeriodStart={payPeriodStart}
                      payPeriodEnd={payPeriodEnd}
                      onCancel={() => setEditingId(null)}
                      onDone={(err) => {
                        if (err) {
                          setError(err);
                          return;
                        }
                        setEditingId(null);
                        setError(null);
                        router.refresh();
                      }}
                    />
                  ) : (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 align-top text-slate-900 sm:px-4">{line.patientName}</td>
                      <td className="whitespace-nowrap px-3 py-3 align-top text-slate-700 sm:px-4">{line.serviceDate}</td>
                      <td className="px-3 py-3 align-top text-slate-700 sm:px-4">
                        {billingLineLabel(line.lineType)}
                      </td>
                      <td className="px-3 py-3 text-right align-top font-medium text-slate-900 sm:px-4">
                        {money(line.amount)}
                      </td>
                      {canEdit ? (
                        <td className="whitespace-nowrap px-3 py-2 align-top sm:px-4">
                          <button
                            type="button"
                            className="text-xs font-semibold text-sky-700 hover:underline"
                            onClick={() => setEditingId(line.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ml-3 text-xs font-semibold text-rose-700 hover:underline"
                            onClick={() => {
                              if (!window.confirm("Delete this line?")) return;
                              setError(null);
                              startTransition(async () => {
                                const r = await deleteSelfBillingLineAction({
                                  billingId,
                                  lineId: line.id,
                                });
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
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/90 font-semibold text-slate-900">
                <td colSpan={canEdit ? 3 : 3} className="px-3 py-3 sm:px-4">
                  Total
                </td>
                <td className="px-3 py-3 text-right sm:px-4">{money(running)}</td>
                {canEdit ? <td className="px-3 py-3 sm:px-4" /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 3. Submit */}
      <section className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {status === "draft" ? "Draft" : status === "submitted" ? "Submitted" : "Paid"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Submit by{" "}
              {new Date(deadlineIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit || lines.length === 0 || deadlinePassed || pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await submitSelfBillingWeekAction(billingId);
                if (r.ok) router.refresh();
                else setError(r.error);
              });
            }}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Submitting…" : "Submit this week"}
          </button>
        </div>
        {deadlinePassed && status === "draft" ? (
          <p className="mt-3 text-sm text-amber-900">
            Submission deadline has passed for this period. Contact payroll if you need help.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function EditRow({
  billingId,
  line,
  patients,
  payPeriodStart,
  payPeriodEnd,
  onCancel,
  onDone,
}: {
  billingId: string;
  line: SelfBillingLineVM;
  patients: { id: string; label: string }[];
  payPeriodStart: string;
  payPeriodEnd: string;
  onCancel: () => void;
  onDone: (error?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(line.patientId);
  const [serviceDate, setServiceDate] = useState(line.serviceDate);
  const [lineType, setLineType] = useState<BillingLineType>(
    (BILLING_LINE_TYPES.some((t) => t.value === line.lineType) ? line.lineType : "visit") as BillingLineType
  );
  const [amount, setAmount] = useState(String(line.amount));
  const [notes, setNotes] = useState(line.notes ?? "");

  return (
    <tr className="border-b border-sky-100 bg-sky-50/40">
      <td colSpan={5} className="px-3 py-4 sm:px-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Date</label>
            <input
              type="date"
              min={payPeriodStart}
              max={payPeriodEnd}
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Type</label>
            <select
              value={lineType}
              onChange={(e) => setLineType(e.target.value as BillingLineType)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
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
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-2 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await updateSelfBillingLineAction({
                  billingId,
                  lineId: line.id,
                  patientId,
                  serviceDate,
                  lineType,
                  amount,
                  notes,
                });
                onDone(r.ok ? undefined : r.error);
              });
            }}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
