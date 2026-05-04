"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  clampIsoDateToRange,
  getSelectableServiceDateBoundsLocal,
  localCalendarDateString,
} from "@/lib/payroll/self-billing-dates";

import {
  addSelfBillingLineAction,
  deleteSelfBillingLineAction,
  reopenSelfBillingWeekAction,
  submitSelfBillingWeekAction,
  updateSelfBillingLineAction,
} from "./self-billing-actions";
import { BILLING_LINE_TYPES, billingLineLabel, type BillingLineType } from "./self-billing-types";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  deadlineIso: string;
  /** Blocks submit when the period deadline has passed unless the invoice was reopened / returned to draft. */
  submissionBlockedByDeadline: boolean;
  /** Draft lines are only editable for the current pay week from Workspace Pay. */
  allowNurseEdit: boolean;
  /** Current-week submitted (not paid): show Reopen invoice. */
  canReopenSubmitted: boolean;
  lines: SelfBillingLineVM[];
  patients: { id: string; label: string }[];
};

export function SelfBillingView({
  billingId,
  status,
  deadlineIso,
  submissionBlockedByDeadline,
  allowNurseEdit,
  canReopenSubmitted,
  lines,
  patients,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addLineSuccess, setAddLineSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  const serviceBounds = useMemo(() => getSelectableServiceDateBoundsLocal(new Date()), []);

  const [patientQuery, setPatientQuery] = useState("");
  const [addPatientId, setAddPatientId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(() =>
    clampIsoDateToRange(localCalendarDateString(new Date()), serviceBounds.min, serviceBounds.max)
  );
  const [addType, setAddType] = useState<BillingLineType>("visit");
  const [addAmount, setAddAmount] = useState("");
  const [addNotes, setAddNotes] = useState("");

  useEffect(() => {
    if (!addLineSuccess) return;
    const t = window.setTimeout(() => setAddLineSuccess(false), 3200);
    return () => window.clearTimeout(t);
  }, [addLineSuccess]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 40);
    return patients.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 40);
  }, [patients, patientQuery]);

  const canEdit = allowNurseEdit;
  const running = lines.reduce((s, l) => s + l.amount, 0);

  const dateHelperText = serviceBounds.isMondayWindow
    ? "You can bill dates from this week and last week."
    : "You can bill dates from this week only.";

  const selectedPatientLabel = addPatientId ? patients.find((p) => p.id === addPatientId)?.label ?? null : null;

  function onAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (!addPatientId) {
      setError("Select a patient.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addSelfBillingLineAction({
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
        setAddLineSuccess(true);
        router.refresh();
      } else setError(r.error);
    });
  }

  const statusStyles =
    status === "draft"
      ? "border-slate-200/90 bg-gradient-to-br from-slate-50 to-white"
      : status === "submitted"
        ? "border-sky-200/90 bg-gradient-to-br from-sky-50/90 to-white"
        : "border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white";

  return (
    <div className="space-y-8 sm:space-y-10">
      {error ? (
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {addLineSuccess ? (
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-950 shadow-sm">
          Line added. Review it in your entries below.
        </div>
      ) : null}

      {/* 1. Add line */}
      <section className="rounded-[22px] border border-sky-100/90 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-[0_8px_30px_-12px_rgba(30,58,138,0.12)] sm:p-6">
        <div className="border-b border-sky-100/80 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800/80">Add</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Visit or commission</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Manual amounts — add one row per visit or commission line for this invoice.
          </p>
        </div>

        <form onSubmit={onAddLine} className="mt-5 space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-700">Patient</label>
            <input
              type="search"
              autoComplete="off"
              placeholder="Search by name…"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              disabled={!canEdit}
              className="mt-2 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/30 transition focus:border-sky-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
            {addPatientId && selectedPatientLabel ? (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-bold text-white shadow-sm"
                  aria-hidden
                >
                  {selectedPatientLabel.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900/70">Selected patient</p>
                  <p className="truncate text-sm font-semibold text-slate-900">{selectedPatientLabel}</p>
                  {canEdit ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
                      onClick={() => setAddPatientId(null)}
                    >
                      Change
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <ul className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200/80 bg-white shadow-inner shadow-slate-950/5">
                {filteredPatients.length === 0 ? (
                  <li className="px-3 py-4 text-center text-sm text-slate-500">No matches.</li>
                ) : (
                  filteredPatients.map((p) => (
                    <li key={p.id} className="border-b border-slate-100 last:border-0">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          setAddPatientId(p.id);
                          setPatientQuery("");
                        }}
                        className="flex w-full px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-sky-50/80 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Date of service</label>
              <input
                type="date"
                required
                value={addDate}
                min={serviceBounds.min}
                max={serviceBounds.max}
                onChange={(e) => setAddDate(e.target.value)}
                disabled={!canEdit}
                className="mt-2 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/30 focus:border-sky-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <p className="mt-2 text-xs leading-snug text-slate-500">{dateHelperText}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as BillingLineType)}
                disabled={!canEdit}
                className="mt-2 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/30 focus:border-sky-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
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
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  onBlur={() => {
                    const n = Number.parseFloat(addAmount.trim());
                    if (Number.isFinite(n) && n >= 0) {
                      setAddAmount((Math.round(n * 100) / 100).toFixed(2));
                    }
                  }}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-slate-200/90 bg-white py-2.5 pl-8 pr-3.5 text-sm font-medium tracking-tight text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/30 focus:border-sky-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">Notes (optional)</label>
            <textarea
              rows={2}
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Optional context for payroll"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-950/5 outline-none ring-sky-300/30 focus:border-sky-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </div>

          <button
            type="submit"
            disabled={!canEdit || pending}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_-8px_rgba(37,99,235,0.55)] transition hover:from-sky-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[160px]"
          >
            {pending ? "Adding…" : "Add line"}
          </button>
        </form>
      </section>

      {/* 2. Entries */}
      <section>
        <div className="mb-4 flex flex-col gap-1 border-b border-slate-200/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">This week</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Entries</h2>
          </div>
        </div>

        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,0.16)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3.5 sm:pl-5">Patient</th>
                  <th className="px-3 py-3.5">Date</th>
                  <th className="px-3 py-3.5">Type</th>
                  <th className="px-3 py-3.5 text-right">Amount</th>
                  {canEdit ? <th className="w-32 px-3 py-3.5 sm:pr-5">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-5 py-14 text-center">
                      <div className="mx-auto max-w-sm">
                        <p className="text-sm font-medium text-slate-800">No entries yet</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          Your invoice lines will show up here. Start by adding a visit or commission above.
                        </p>
                      </div>
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
                        serviceDateMin={serviceBounds.min}
                        serviceDateMax={serviceBounds.max}
                        dateFieldHelp={dateHelperText}
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
                      <tr
                        key={line.id}
                        className="border-b border-slate-100/90 transition-colors last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="max-w-[10rem] px-4 py-3.5 align-top text-slate-900 sm:max-w-none sm:pl-5">
                          <span className="font-medium">{line.patientName}</span>
                          {line.notes?.trim() ? (
                            <p className="mt-1 text-xs leading-snug text-slate-500" title={line.notes}>
                              <span className="font-medium text-slate-600">Note:</span> {line.notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top text-slate-600">{line.serviceDate}</td>
                        <td className="px-3 py-3.5 align-top text-slate-700">{billingLineLabel(line.lineType)}</td>
                        <td className="px-3 py-3.5 text-right align-top font-semibold tabular-nums text-slate-900">
                          {money(line.amount)}
                        </td>
                        {canEdit ? (
                          <td className="whitespace-nowrap px-3 py-3 align-top sm:pr-5">
                            <button
                              type="button"
                              className="text-xs font-semibold text-sky-700 hover:underline"
                              onClick={() => setEditingId(line.id)}
                            >
                              Edit
                            </button>
                            <span className="mx-2 text-slate-300" aria-hidden>
                              |
                            </span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-700 hover:underline"
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
                <tr className="border-t-2 border-slate-200 bg-gradient-to-r from-slate-100/90 to-slate-50/90">
                  <td
                    colSpan={canEdit ? 3 : 3}
                    className="px-4 py-4 text-sm font-bold uppercase tracking-wide text-slate-700 sm:pl-5"
                  >
                    Week total
                  </td>
                  <td className="px-3 py-4 text-right text-base font-bold tabular-nums text-slate-900">{money(running)}</td>
                  {canEdit ? <td className="px-3 py-4 sm:pr-5" /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Submit */}
      <section
        className={`rounded-[22px] border p-5 shadow-[0_12px_34px_-14px_rgba(15,23,42,0.18)] sm:p-6 ${statusStyles}`}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Invoice status</p>
            <p
              className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                status === "draft"
                  ? "bg-slate-200/80 text-slate-800"
                  : status === "submitted"
                    ? "bg-sky-200/80 text-sky-950"
                    : "bg-emerald-200/80 text-emerald-950"
              }`}
            >
              {status === "draft" ? "Draft" : status === "submitted" ? "Submitted" : "Paid"}
            </p>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-slate-600">
              {status === "draft"
                ? "Draft means you can still add, edit, or remove lines. Submit when the week is complete."
                : status === "submitted"
                  ? canReopenSubmitted
                    ? "Submitted to payroll. Reopen if you need to fix a line or add a late visit—then submit again."
                    : "Submitted to payroll for this week. You cannot change lines from here."
                  : "Marked paid. Contact payroll if something looks wrong."}
            </p>
            <p className="mt-3 text-xs text-slate-600">
              Submit deadline:{" "}
              <span className="font-medium text-slate-800">
                {formatAppDateTime(deadlineIso, "—", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            {canEdit ? (
              <button
                type="button"
                disabled={lines.length === 0 || submissionBlockedByDeadline || pending}
                onClick={() => setShowSubmitConfirm(true)}
                className="rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit this week
              </button>
            ) : null}
            {canReopenSubmitted ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowReopenConfirm(true)}
                className="rounded-xl border border-sky-300 bg-white px-6 py-3.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:opacity-50"
              >
                Reopen invoice
              </button>
            ) : null}
          </div>
        </div>
        {submissionBlockedByDeadline && status === "draft" ? (
          <p className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Submission deadline has passed for this period. Contact payroll if you need help.
          </p>
        ) : null}
      </section>

      {showSubmitConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 pb-8 backdrop-blur-[2px] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl">
            <h3 id="submit-confirm-title" className="text-lg font-semibold text-slate-900">
              Submit this week?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You are about to submit <span className="font-semibold text-slate-900">{money(running)}</span> for{" "}
              <span className="font-semibold text-slate-900">{lines.length}</span> line{lines.length === 1 ? "" : "s"}.
              Until payroll marks this week paid, you can use <span className="font-semibold text-slate-800">Reopen invoice</span>{" "}
              to make changes and submit again.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                onClick={() => {
                  setError(null);
                  setShowSubmitConfirm(false);
                  startTransition(async () => {
                    const r = await submitSelfBillingWeekAction(billingId);
                    if (r.ok) router.refresh();
                    else setError(r.error);
                  });
                }}
              >
                {pending ? "Submitting…" : "Yes, submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showReopenConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 pb-8 backdrop-blur-[2px] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl">
            <h3 id="reopen-confirm-title" className="text-lg font-semibold text-slate-900">
              Reopen this invoice?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The invoice will move back to <span className="font-semibold text-slate-900">Draft</span>. You can add, edit, or
              delete lines, then submit again. Payroll has not marked this week paid yet.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setShowReopenConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                onClick={() => {
                  setError(null);
                  setShowReopenConfirm(false);
                  startTransition(async () => {
                    const r = await reopenSelfBillingWeekAction(billingId);
                    if (r.ok) router.refresh();
                    else setError(r.error);
                  });
                }}
              >
                {pending ? "Reopening…" : "Yes, reopen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditRow({
  billingId,
  line,
  patients,
  serviceDateMin,
  serviceDateMax,
  dateFieldHelp,
  onCancel,
  onDone,
}: {
  billingId: string;
  line: SelfBillingLineVM;
  patients: { id: string; label: string }[];
  serviceDateMin: string;
  serviceDateMax: string;
  dateFieldHelp: string;
  onCancel: () => void;
  onDone: (error?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(line.patientId);
  const [serviceDate, setServiceDate] = useState(
    clampIsoDateToRange(line.serviceDate, serviceDateMin, serviceDateMax)
  );
  const [lineType, setLineType] = useState<BillingLineType>(
    (BILLING_LINE_TYPES.some((t) => t.value === line.lineType) ? line.lineType : "visit") as BillingLineType
  );
  const [amount, setAmount] = useState(
    line.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [notes, setNotes] = useState(line.notes ?? "");

  return (
    <tr className="border-b border-sky-100 bg-sky-50/50">
      <td colSpan={5} className="px-4 py-5 sm:px-5">
        <p className="text-xs font-semibold text-sky-900">Editing line</p>
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
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Date of service</label>
            <input
              type="date"
              min={serviceDateMin}
              max={serviceDateMax}
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-xs text-slate-500">{dateFieldHelp}</p>
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
            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
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
