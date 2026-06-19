"use client";

import { useState } from "react";

export function PrivatePayDeleteInvoiceModal({
  open,
  invoiceNumber,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  invoiceNumber: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");

  if (!open) return null;

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-rose-900">Delete permanently?</h3>
        <p className="mt-2 text-sm text-slate-600">
          This permanently deletes invoice{" "}
          <span className="font-semibold text-slate-900">{invoiceNumber}</span> and related local invoice
          records. This cannot be undone.
        </p>
        <p className="mt-2 text-xs text-slate-500">Stripe records (if any) are not deleted and may remain in Stripe.</p>

        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Type DELETE to confirm
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            autoComplete="off"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmText("");
              onClose();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canDelete}
            onClick={onConfirm}
            className="rounded-md border border-rose-700 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
