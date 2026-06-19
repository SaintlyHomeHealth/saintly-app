"use client";

import { useState } from "react";

import { formatCentsUsd } from "@/lib/private-pay/format";
import type { PrivatePayPaymentReport } from "@/lib/private-pay/types";
import type { RecordPaymentPayload } from "./private-pay-client-actions";

const METHOD_OPTIONS = [
  { value: "square", label: "Square", backend: "manual", methodLabel: "Square" },
  { value: "cash", label: "Cash", backend: "cash" },
  { value: "check", label: "Check", backend: "check" },
  { value: "bank_transfer", label: "Bank Transfer", backend: "other", methodLabel: "Bank Transfer" },
  { value: "other", label: "Other", backend: "other", methodLabel: "Other" },
  { value: "custom", label: "Custom", backend: "other" },
] as const;

type MethodValue = (typeof METHOD_OPTIONS)[number]["value"];

function todayInputValue(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

type RecordPaymentProps = {
  open: boolean;
  invoiceNumber: string;
  totalCents: number;
  pendingReport?: PrivatePayPaymentReport | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: RecordPaymentPayload) => void;
};

export function PrivatePayRecordPaymentModal(props: RecordPaymentProps) {
  if (!props.open) return null;
  return <RecordPaymentForm {...props} />;
}

function RecordPaymentForm({
  invoiceNumber,
  totalCents,
  busy,
  error,
  onClose,
  onSubmit,
}: RecordPaymentProps) {
  const [method, setMethod] = useState<MethodValue>("square");
  const [customLabel, setCustomLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(todayInputValue());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [sendReceipt, setSendReceipt] = useState(false);
  const [receiptDelivery, setReceiptDelivery] = useState<"text" | "email" | "both">("both");

  const submit = () => {
    const option = METHOD_OPTIONS.find((m) => m.value === method) ?? METHOD_OPTIONS[0];
    const noteLines: string[] = [];
    const methodLabel =
      method === "custom"
        ? customLabel.trim() || "Custom"
        : "methodLabel" in option && option.methodLabel
          ? option.methodLabel
          : option.label;
    noteLines.push(`Payment method: ${methodLabel}`);
    const internal = note.trim();
    if (internal) noteLines.push(internal);
    onSubmit({
      method: option.backend,
      amount,
      paid_at: paidDate,
      reference: reference.trim() || null,
      note: noteLines.join("\n"),
      send_receipt: sendReceipt,
      receipt_delivery: receiptDelivery,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Mark paid</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Invoice {invoiceNumber} · {formatCentsUsd(totalCents)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Record payment after the client pays through Square or another method outside this system.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Amount paid</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                placeholder={`Default ${formatCentsUsd(totalCents)}`}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Payment date</label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Payment method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as MethodValue)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {method === "custom" ? (
            <div>
              <label className="text-xs font-semibold text-slate-600">Method name</label>
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                disabled={busy}
                placeholder="e.g. Money order"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          <div>
            <label className="text-xs font-semibold text-slate-600">Reference / confirmation # (optional)</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={busy}
              placeholder="Square confirmation, check #, etc."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Internal note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Who took the payment, notes for staff, etc."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={sendReceipt}
                onChange={(e) => setSendReceipt(e.target.checked)}
                disabled={busy}
              />
              Send receipt
            </label>
            {sendReceipt ? (
              <div className="mt-2">
                <label className="text-xs font-semibold text-slate-600">Delivery</label>
                <select
                  value={receiptDelivery}
                  onChange={(e) => setReceiptDelivery(e.target.value as "text" | "email" | "both")}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="both">Text and email</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Record payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
