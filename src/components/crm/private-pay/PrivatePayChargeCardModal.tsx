"use client";

import { useState } from "react";

import { formatCentsUsd } from "@/lib/private-pay/format";
import { formatSavedCardLabel } from "@/lib/private-pay/payment-badges";
import type { PrivatePayInvoiceWithItems, PrivatePayPaymentMethodOnFile } from "@/lib/private-pay/types";

export function PrivatePayChargeCardModal({
  open,
  invoice,
  paymentMethods,
  busy,
  error,
  onClose,
  onSuccess,
}: {
  open: boolean;
  invoice: PrivatePayInvoiceWithItems | null;
  paymentMethods: PrivatePayPaymentMethodOnFile[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSuccess: (invoice: PrivatePayInvoiceWithItems, message: string) => void;
}) {
  const defaultPm = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;
  const [selectedId, setSelectedId] = useState(defaultPm?.id ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;

  if (!open || !invoice) return null;

  const selected = paymentMethods.find((m) => m.id === selectedId) ?? defaultPm;
  const customerName = (invoice.billing_name ?? "").trim() || "Customer";

  const charge = async () => {
    if (!selected) {
      setLocalError("No saved card selected.");
      return;
    }
    setLocalError(null);
    setAuthUrl(null);
    setLocalBusy(true);
    try {
      const res = await fetch(`/api/private-pay/invoices/${invoice.id}/charge-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method_id: selected.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        invoice?: PrivatePayInvoiceWithItems;
        message?: string;
        error?: string;
        authUrl?: string;
      };

      if (json.ok && json.invoice) {
        onSuccess(json.invoice, json.message ?? "Card charged successfully.");
        return;
      }

      if (json.status === "requires_action") {
        setLocalError(json.error ?? "Authentication required.");
        setAuthUrl(json.authUrl ?? null);
        return;
      }

      setLocalError(json.error ?? "Card charge failed.");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLocalBusy(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">Charge card</h3>
        <p className="mt-1 text-xs text-slate-500">Confirm before charging the customer&apos;s card on file.</p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Customer</dt>
            <dd className="font-medium text-slate-900">{customerName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Invoice</dt>
            <dd className="font-medium text-slate-900">{invoice.invoice_number}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{formatCentsUsd(invoice.total_cents)}</dd>
          </div>
        </dl>

        {paymentMethods.length > 1 ? (
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-600">Card on file</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatSavedCardLabel(m.brand, m.last4, m.exp_month, m.exp_year)}
                  {m.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : selected ? (
          <p className="mt-4 text-sm text-slate-800">
            <span className="text-slate-500">Card: </span>
            {formatSavedCardLabel(selected.brand, selected.last4, selected.exp_month, selected.exp_year)}
          </p>
        ) : (
          <p className="mt-4 text-sm text-rose-700">No saved card on file for this customer.</p>
        )}

        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This will charge the saved card for this invoice balance.
        </p>

        {displayError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {displayError}
          </p>
        ) : null}

        {authUrl ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">Send secure payment link</p>
            <a href={authUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block underline">
              Open authentication checkout
            </a>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy || !selected}
            onClick={() => charge()}
            className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {isBusy ? "Charging…" : "Charge card"}
          </button>
        </div>
      </div>
    </div>
  );
}
