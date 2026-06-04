"use client";

import { useState } from "react";

import {
  PRIVATE_PAY_PAYMENT_METHOD_LABELS,
  PRIVATE_PAY_REPORT_PAYMENT_METHODS,
  type PrivatePayReportPaymentMethod,
} from "@/lib/private-pay/constants";

function todayInputValue(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset();
  return new Date(now.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

export function PaymentReportForm({
  publicToken,
  defaultAmount,
}: {
  publicToken: string;
  defaultAmount: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PrivatePayReportPaymentMethod>("zelle");
  const [amount, setAmount] = useState(defaultAmount);
  const [reportedDate, setReportedDate] = useState(todayInputValue());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
        <p className="text-sm font-semibold text-emerald-900">Thank you.</p>
        <p className="mt-1 text-xs text-emerald-800">
          Saintly will verify the payment and send your receipt.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-xl border-2 border-sky-600 bg-white px-5 py-3 text-sm font-semibold text-sky-800 hover:bg-sky-50"
      >
        I sent payment
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/private-pay/public/invoice/${encodeURIComponent(publicToken)}/report-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          amount,
          reported_date: reportedDate,
          reference,
          note,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not submit payment report.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-sm font-semibold text-slate-900">Report your payment</p>
      <p className="mt-1 text-xs text-slate-600">
        This does not mark your invoice paid. Saintly will verify your payment before sending a receipt.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-600">Payment method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PrivatePayReportPaymentMethod)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {PRIVATE_PAY_REPORT_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PRIVATE_PAY_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Amount sent</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Date sent</label>
            <input
              type="date"
              value={reportedDate}
              onChange={(e) => setReportedDate(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Confirmation / reference # (optional)</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
