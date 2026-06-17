"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  leadId: string;
  leadName: string;
};

export function MoveCrmLeadToRecruitingLeadsButton({ leadId, leadName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmMove() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/move-to-recruiting-leads`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Move failed.");
        return;
      }
      setOpen(false);
      if (data.redirectTo) {
        router.push(data.redirectTo);
      }
      router.refresh();
    } catch {
      setError("Network error while moving lead.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
      >
        Move to Recruiting Leads
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
            aria-labelledby="move-crm-to-recruiting-title"
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="move-crm-to-recruiting-title" className="text-lg font-semibold text-slate-900">
              Move to Recruiting Leads?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Move <span className="font-medium text-slate-900">{leadName}</span> out of CRM Leads and into Recruiting
              Leads? The CRM lead row will be removed after the recruiting record is created.
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
                className="rounded-lg border border-amber-700 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                onClick={() => void confirmMove()}
                disabled={pending}
              >
                {pending ? "Moving…" : "Move to Recruiting Leads"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
