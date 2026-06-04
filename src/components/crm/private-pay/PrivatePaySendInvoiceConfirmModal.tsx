"use client";

export function PrivatePaySendInvoiceConfirmModal({
  open,
  channel,
  invoiceNumber,
  invoiceUrl,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  channel: "email" | "text";
  invoiceNumber: string;
  invoiceUrl: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const label = channel === "email" ? "email" : "text message";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Send invoice by {channel === "email" ? "email" : "text"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Invoice {invoiceNumber}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Review the secure link below. The customer will open this page to view/download the invoice PDF and pay
          (no clinical details are included in the {label}).
        </p>

        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">Invoice link</p>
          <input
            readOnly
            value={invoiceUrl}
            className="mt-1.5 w-full rounded-lg border border-sky-200 bg-white px-2 py-2 font-mono text-[11px] text-slate-800"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
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
            onClick={onConfirm}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? "Sending…" : `Send ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
