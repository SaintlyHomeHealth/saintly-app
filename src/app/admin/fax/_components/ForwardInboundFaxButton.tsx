"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { forwardInboundFaxAction } from "@/app/admin/fax/actions";
import { crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

type Toast = { type: "ok" | "err"; message: string };

const SUBJECT_DEFAULT = "Forwarded fax from Saintly Home Health";

type Props = {
  faxId: string;
  originalFromDisplay: string;
  originalReceivedDisplay: string;
  pageCount: number | null;
  variant: "row" | "detail";
};

export function ForwardInboundFaxButton({ faxId, originalFromDisplay, originalReceivedDisplay, pageCount, variant }: Props) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientOrg, setRecipientOrg] = useState("");
  const [faxTo, setFaxTo] = useState("");
  const [subject, setSubject] = useState(SUBJECT_DEFAULT);
  const [coverNote, setCoverNote] = useState("");
  const [includeCover, setIncludeCover] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "ok" ? 4500 : 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  function openModal() {
    setRecipientName("");
    setRecipientOrg("");
    setFaxTo("");
    setSubject(SUBJECT_DEFAULT);
    setCoverNote("");
    setIncludeCover(true);
    setLocalError(null);
    setOpen(true);
  }

  function closeModal() {
    if (!pending) {
      setOpen(false);
      setLocalError(null);
    }
  }

  function submit() {
    setLocalError(null);
    const trimmedTo = faxTo.trim();
    if (!trimmedTo) {
      setLocalError("Enter a fax number.");
      return;
    }
    startTransition(async () => {
      const result = await forwardInboundFaxAction({
        inboundFaxId: faxId,
        toNumber: trimmedTo,
        recipientName,
        recipientOrganization: recipientOrg,
        subject,
        coverNote,
        includeCoverSheet: includeCover,
        originalFromDisplay,
        originalReceivedDisplay,
      });
      if (result.ok) {
        setOpen(false);
        setToast({ type: "ok", message: "Fax queued successfully." });
        router.refresh();
        return;
      }
      setLocalError(result.error);
    });
  }

  const label = variant === "detail" ? "Fax this doc to another number" : "Fax this doc";
  const pagesLabel = pageCount != null ? String(pageCount) : "—";

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
        className={variant === "row" ? crmActionBtnSky : crmPrimaryCtaCls}
        onClick={openModal}
        aria-haspopup="dialog"
      >
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id={`${formId}-title`} className="text-base font-bold text-slate-900">
                  Fax this document
                </p>
                <p className="mt-1 text-sm text-slate-500">Send a copy of this inbound fax to another number.</p>
              </div>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                onClick={closeModal}
                disabled={pending}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {localError ? (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {localError}
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Original inbound fax</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>
                    <span className="font-semibold text-slate-700">From: </span>
                    {originalFromDisplay}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-700">Received: </span>
                    {originalReceivedDisplay}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-700">Pages: </span>
                    {pagesLabel}
                  </li>
                </ul>
              </div>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Recipient name
                <input
                  type="text"
                  name="recipientName"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  disabled={pending}
                  autoComplete="name"
                  className={crmFilterInputCls}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Fax number <span className="text-rose-600">*</span>
                <input
                  type="tel"
                  name="faxTo"
                  value={faxTo}
                  onChange={(e) => setFaxTo(e.target.value)}
                  disabled={pending}
                  required
                  autoComplete="tel"
                  placeholder="(480) 555-1212"
                  className={crmFilterInputCls}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Organization / company <span className="font-normal text-slate-500">(optional)</span>
                <input
                  type="text"
                  name="recipientOrg"
                  value={recipientOrg}
                  onChange={(e) => setRecipientOrg(e.target.value)}
                  disabled={pending}
                  className={crmFilterInputCls}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Subject
                <input
                  type="text"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={pending}
                  maxLength={500}
                  className={crmFilterInputCls}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Cover sheet note / message <span className="font-normal text-slate-500">(optional)</span>
                <textarea
                  name="coverNote"
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  disabled={pending}
                  rows={3}
                  className={`${crmFilterInputCls} min-h-[4.5rem]`}
                />
                <span className="font-normal text-slate-500">Shown on the cover sheet when included.</span>
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={includeCover}
                  onChange={(e) => setIncludeCover(e.target.checked)}
                  disabled={pending}
                />
                Include cover sheet
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={crmActionBtnSky} onClick={closeModal} disabled={pending}>
                  Cancel
                </button>
                <button type="button" className={crmPrimaryCtaCls} onClick={() => submit()} disabled={pending}>
                  {pending ? "Sending…" : "Send fax"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
