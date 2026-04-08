"use client";

import { useState, useTransition } from "react";

import { softDeleteLead } from "@/app/admin/crm/actions";

type Props = {
  leadId: string;
  /** Table row: compact text link. Detail page: slightly larger. Inline: pill in CRM row action group. tableInlineSubtle: muted outline in dense toolbars. */
  variant?: "table" | "tableInline" | "tableInlineSubtle" | "detail";
};

export function LeadDeleteButton({ leadId, variant = "table" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const btnCls =
    variant === "table"
      ? "text-[11px] font-semibold text-rose-700 underline-offset-2 hover:underline"
      : variant === "tableInline"
        ? "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-md"
        : variant === "tableInlineSubtle"
          ? "inline-flex items-center justify-center rounded-md border border-rose-200/70 bg-white px-2 py-1 text-[10px] font-medium text-rose-700/85 shadow-none transition hover:border-rose-300/80 hover:bg-rose-50/60"
          : "rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100";

  const confirm = () => {
    const fd = new FormData();
    fd.set("leadId", leadId);
    startTransition(async () => {
      await softDeleteLead(fd);
    });
  };

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
            aria-labelledby="crm-lead-delete-title"
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="crm-lead-delete-title" className="text-lg font-semibold text-slate-900">
              Delete lead?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will remove the lead from the active CRM list but keep historical records.
            </p>
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
                onClick={confirm}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
