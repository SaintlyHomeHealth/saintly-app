"use client";

import { useState } from "react";

import {
  PRIVATE_PAY_MANUAL_PAYMENT_METHODS,
  PRIVATE_PAY_METHOD_USES_REFERENCE,
  PRIVATE_PAY_PAYMENT_METHOD_LABELS,
  type PrivatePayManualPaymentMethod,
} from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";
import type { PrivatePayPaymentReport } from "@/lib/private-pay/types";

export type RecordPaymentInput = {
  method: PrivatePayManualPaymentMethod;
  reference: string;
  amount: string;
  paidDate: string;
  note: string;
  customerNote: string;
  sendReceipt: boolean;
  receiptDelivery: "text" | "email" | "both";
};

function todayInputValue(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

function formatReportDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function PrivatePayRecordPaymentModal({
  open,
  invoiceNumber,
  totalCents,
  pendingReport,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  invoiceNumber: string;
  totalCents: number;
  pendingReport: PrivatePayPaymentReport | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: RecordPaymentInput) => void;
}) {
  const [method, setMethod] = useState<PrivatePayManualPaymentMethod>(
    pendingReport?.payment_method ?? "zelle"
  );
  const [reference, setReference] = useState(pendingReport?.payment_reference ?? "");
  const [amount, setAmount] = useState(
    pendingReport?.amount_cents != null ? (pendingReport.amount_cents / 100).toFixed(2) : ""
  );
  const [paidDate, setPaidDate] = useState(
    pendingReport?.reported_date ?? todayInputValue()
  );
  const [note, setNote] = useState("");
  const [customerNote, setCustomerNote] = useState(pendingReport?.customer_note ?? "");
  const [sendReceipt, setSendReceipt] = useState(true);
  const [receiptDelivery, setReceiptDelivery] = useState<"text" | "email" | "both">("both");

  if (!open) return null;

  const usesReference = PRIVATE_PAY_METHOD_USES_REFERENCE[method];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Record payment</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Invoice {invoiceNumber} · {formatCentsUsd(totalCents)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {pendingReport ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-semibold">Customer reported payment</p>
            <p className="mt-1">
              {PRIVATE_PAY_PAYMENT_METHOD_LABELS[pendingReport.payment_method]}
              {pendingReport.amount_cents != null ? ` · ${formatCentsUsd(pendingReport.amount_cents)}` : ""}
              {pendingReport.reported_date ? ` · ${formatReportDate(pendingReport.reported_date)}` : ""}
            </p>
            {pendingReport.payment_reference ? (
              <p className="mt-0.5">Ref: {pendingReport.payment_reference}</p>
            ) : null}
            {pendingReport.customer_note ? <p className="mt-0.5">Note: {pendingReport.customer_note}</p> : null}
          </div>
        ) : null}

        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Only record a payment you have confirmed was received. Zelle, Cash App, and other manual payments are never
          auto-marked paid from the customer page.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Payment method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PrivatePayManualPaymentMethod)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {PRIVATE_PAY_MANUAL_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PRIVATE_PAY_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Reference / confirmation # {usesReference ? "" : "(optional)"}
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={busy}
              placeholder={usesReference ? "e.g. Zelle confirmation, check #" : "Optional"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Amount received</label>
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
            <label className="text-xs font-semibold text-slate-600">Internal note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Customer note (optional)</label>
            <input
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              disabled={busy}
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
              Send receipt after marking paid
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
            onClick={() =>
              onSubmit({
                method,
                reference,
                amount,
                paidDate,
                note,
                customerNote,
                sendReceipt,
                receiptDelivery,
              })
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
