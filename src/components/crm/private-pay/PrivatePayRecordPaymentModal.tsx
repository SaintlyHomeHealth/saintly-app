"use client";

import { useState } from "react";

import {
  PRIVATE_PAY_MANUAL_PAYMENT_METHODS,
  PRIVATE_PAY_METHOD_USES_REFERENCE,
  PRIVATE_PAY_PAYMENT_METHOD_LABELS,
  type PrivatePayManualPaymentMethod,
} from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";

export type RecordPaymentInput = {
  method: PrivatePayManualPaymentMethod;
  reference: string;
  amount: string;
  note: string;
};

export function PrivatePayRecordPaymentModal({
  open,
  invoiceNumber,
  totalCents,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  invoiceNumber: string;
  totalCents: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: RecordPaymentInput) => void;
}) {
  const [method, setMethod] = useState<PrivatePayManualPaymentMethod>("zelle");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  if (!open) return null;

  const usesReference = PRIVATE_PAY_METHOD_USES_REFERENCE[method];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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

        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Only record a payment you have confirmed was received. Card / Apple Pay payments should use the secure link.
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

          <div>
            <label className="text-xs font-semibold text-slate-600">Amount received (optional)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder={`Defaults to ${formatCentsUsd(totalCents)}`}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
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
            onClick={() => onSubmit({ method, reference, amount, note })}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
