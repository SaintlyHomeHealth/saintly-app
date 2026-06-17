"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  recruitingLeadSourceBadge,
  recruitingLeadSourceBadgeClass,
  type RecruitingLeadSourceBadge,
} from "@/lib/recruiting/recruiting-lead-source-display";

import { RecruitingLeadSendEmailModal } from "./RecruitingLeadSendEmailModal";

const rowActionBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:shadow-md whitespace-nowrap";

const deleteBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-800 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-md whitespace-nowrap";

type RecruitingLeadDeleteButtonProps = {
  leadId: string;
  leadName: string;
  variant?: "table" | "detail";
  onDeleted?: () => void;
};

export function RecruitingLeadDeleteButton({
  leadId,
  leadName,
  variant = "table",
  onDeleted,
}: RecruitingLeadDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const btnCls = variant === "detail" ? deleteBtnCls : deleteBtnCls;

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting-leads/${encodeURIComponent(leadId)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Delete failed.");
        return;
      }
      setOpen(false);
      onDeleted?.();
      router.refresh();
    } catch {
      setError("Network error while deleting.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnCls}>
        Delete
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="recruiting-lead-delete-title"
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="recruiting-lead-delete-title" className="text-lg font-semibold text-slate-900">
              Delete recruiting lead?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently delete <span className="font-medium text-slate-900">{leadName}</span> and related
              recruiting activity. This cannot be undone.
            </p>
            {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-800 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                onClick={() => void confirmDelete()}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function RecruitingLeadSourceBadge({
  source,
  formName,
  rawPayload,
}: {
  source: string | null;
  formName?: string | null;
  rawPayload?: unknown;
}) {
  const badge: RecruitingLeadSourceBadge = recruitingLeadSourceBadge({
    source,
    form_name: formName,
    raw_payload: rawPayload,
  });
  return <span className={recruitingLeadSourceBadgeClass(badge)}>{badge}</span>;
}

type RecruitingLeadsListRowActionsProps = {
  leadId: string;
  leadName: string;
  email: string | null;
  detailHref: string;
  emailConfigured: boolean;
};

export function RecruitingLeadsListRowActions({
  leadId,
  leadName,
  email,
  detailHref,
  emailConfigured,
}: RecruitingLeadsListRowActionsProps) {
  const router = useRouter();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Link href={detailHref} className={rowActionBtnCls}>
          Open
        </Link>
        <button type="button" onClick={() => setEmailModalOpen(true)} className={rowActionBtnCls}>
          Send email
        </button>
        <RecruitingLeadDeleteButton
          leadId={leadId}
          leadName={leadName}
          variant="table"
          onDeleted={() => setToast("Recruiting lead deleted.")}
        />
      </div>
      {toast ? (
        <p className="mt-1 text-[11px] font-medium text-emerald-700" role="status">
          {toast}
        </p>
      ) : null}
      {emailModalOpen ? (
        <RecruitingLeadSendEmailModal
          leadId={leadId}
          recipientEmail={email}
          emailConfigured={emailConfigured}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => {
            setToast("Email sent.");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

export function RecruitingLeadDetailDeleteButton({
  leadId,
  leadName,
  listBackHref,
}: {
  leadId: string;
  leadName: string;
  listBackHref: string;
}) {
  const router = useRouter();

  return (
    <RecruitingLeadDeleteButton
      leadId={leadId}
      leadName={leadName}
      variant="detail"
      onDeleted={() => {
        router.push(listBackHref);
        router.refresh();
      }}
    />
  );
}
