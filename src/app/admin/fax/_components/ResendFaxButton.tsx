"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { resendFaxAction } from "@/app/admin/fax/actions";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";

type Toast = { type: "ok" | "err"; message: string };

type Props = {
  faxId: string;
  /** Stored fax number (E.164 or similar); shown formatted in the field. */
  initialRecipientNumber: string | null;
  note: string | null;
  compact?: boolean;
};

export function ResendFaxButton({ faxId, initialRecipientNumber, note, compact }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [faxTo, setFaxTo] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "ok" ? 4500 : 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (open) {
      setFaxTo(formatPhoneNumber(initialRecipientNumber ?? ""));
      setLocalError(null);
    }
  }, [open, initialRecipientNumber]);

  function closeModal() {
    if (!pending) {
      setOpen(false);
      setLocalError(null);
    }
  }

  function submit() {
    setLocalError(null);
    startTransition(async () => {
      const result = await resendFaxAction(faxId, faxTo);
      if (result.ok) {
        setOpen(false);
        setToast({ type: "ok", message: "Fax resend started." });
        router.refresh();
        return;
      }
      setLocalError(result.error);
    });
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <button
        type="button"
        className={compact ? crmActionBtnSky : crmPrimaryCtaCls}
        onClick={() => setOpen(true)}
      >
        Resend
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div
            className="w-full max-w-lg rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resend-fax-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="resend-fax-title" className="text-base font-bold text-slate-900">
                  Resend Fax
                </p>
                <p className="mt-1 text-sm text-slate-500">Confirm the destination number. You can edit it to send elsewhere.</p>
              </div>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                onClick={closeModal}
                disabled={pending}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {localError ? (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {localError}
                </div>
              ) : null}

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Fax number <span className="text-rose-600">*</span>
                <input
                  type="tel"
                  name="faxTo"
                  autoComplete="tel"
                  value={faxTo}
                  onChange={(e) => setFaxTo(e.target.value)}
                  disabled={pending}
                  placeholder="(480) 555-1212"
                  className={crmFilterInputCls}
                />
              </label>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Original note</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                  {note?.trim() ? note : <span className="text-slate-500">No note on this fax.</span>}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={crmActionBtnSky} onClick={closeModal} disabled={pending}>
                  Cancel
                </button>
                <button type="button" className={crmPrimaryCtaCls} onClick={() => submit()} disabled={pending}>
                  {pending ? "Sending…" : "Send Fax"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
