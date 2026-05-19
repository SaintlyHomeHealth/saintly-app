"use client";

import { useState, useTransition } from "react";

import { hideSalesAgentLeadFromList } from "@/app/sales-agent/actions";

type Props = {
  leadId: string;
};

export function SalesAgentRemoveFromListButton({ leadId }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submitHide() {
    const fd = new FormData();
    fd.set("leadId", leadId);
    startTransition(async () => {
      await hideSalesAgentLeadFromList(fd);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Remove from my list</h3>
      <p className="mt-1 text-sm text-slate-600">
        This only removes the order from your Sales Agent list. Saintly admin will still keep the lead.
      </p>
      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Remove from my list
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={submitHide}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? "Removing…" : "Yes, remove from my list"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmOpen(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
