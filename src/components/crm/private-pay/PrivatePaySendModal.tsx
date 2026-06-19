"use client";

import { useState } from "react";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import type { SendChannel } from "./private-pay-client-actions";

type SendModalProps = {
  open: boolean;
  mode: "invoice" | "receipt";
  invoiceNumber: string;
  email: string | null;
  phone: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (channels: SendChannel[]) => void;
};

/**
 * Simple, channel-pick send modal used for both invoices and receipts.
 * Email/text options only appear when a destination exists; the parent runs
 * the actual send for each chosen channel.
 */
export function PrivatePaySendModal(props: SendModalProps) {
  if (!props.open) return null;
  return <SendForm {...props} />;
}

function SendForm({
  mode,
  invoiceNumber,
  email,
  phone,
  busy,
  error,
  onClose,
  onConfirm,
}: SendModalProps) {
  const hasEmail = Boolean((email ?? "").trim());
  const hasPhone = Boolean((phone ?? "").trim());
  const [emailOn, setEmailOn] = useState(hasEmail);
  const [textOn, setTextOn] = useState(!hasEmail && hasPhone);

  const noun = mode === "invoice" ? "invoice" : "receipt";
  const channels: SendChannel[] = [];
  if (emailOn && hasEmail) channels.push("email");
  if (textOn && hasPhone) channels.push("text");
  const canSend = channels.length > 0 && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Send {noun}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Invoice {invoiceNumber}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          We&apos;ll send a secure {noun === "invoice" ? "payment" : "receipt"} link. No clinical details are included.
        </p>

        {!hasEmail && !hasPhone ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No email or phone on file for this customer. Add billing contact details to the invoice first.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                hasEmail ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50/50 opacity-60"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium text-slate-800">Email</span>
                <span className="block truncate text-xs text-slate-500">
                  {hasEmail ? email : "No email on file"}
                </span>
              </span>
              <input
                type="checkbox"
                checked={emailOn && hasEmail}
                disabled={!hasEmail || busy}
                onChange={(e) => setEmailOn(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
            </label>

            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                hasPhone ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50/50 opacity-60"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium text-slate-800">Text message</span>
                <span className="block truncate text-xs text-slate-500">
                  {hasPhone ? formatPhoneForDisplay(phone) : "No phone on file"}
                </span>
              </span>
              <input
                type="checkbox"
                checked={textOn && hasPhone}
                disabled={!hasPhone || busy}
                onChange={(e) => setTextOn(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
            </label>
          </div>
        )}

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
            disabled={!canSend}
            onClick={() => onConfirm(channels)}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? "Sending…" : `Send ${noun}`}
          </button>
        </div>
      </div>
    </div>
  );
}
