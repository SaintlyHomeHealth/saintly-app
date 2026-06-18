"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const menuBtnCls =
  "block w-full px-3 py-2 text-left text-sm font-medium text-sky-800 hover:bg-sky-50";

const detailBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 whitespace-nowrap";

type Props = {
  leadId: string;
  leadName: string;
  variant?: "detail" | "menu";
  onMoved?: () => void;
};

export function MoveRecruitingLeadToPatientLeadsButton({
  leadId,
  leadName,
  variant = "detail",
  onMoved,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmMove() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting-leads/${encodeURIComponent(leadId)}/move-to-patient-leads`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Move failed.");
        return;
      }
      setOpen(false);
      onMoved?.();
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
        className={variant === "menu" ? menuBtnCls : detailBtnCls}
        role={variant === "menu" ? "menuitem" : undefined}
      >
        Move to Patient Leads
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
            aria-labelledby="move-recruiting-to-patient-title"
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="move-recruiting-to-patient-title" className="text-lg font-semibold text-slate-900">
              Move to Patient Leads?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Move this record out of Recruiting Leads and restore it as a patient CRM lead for{" "}
              <span className="font-medium text-slate-900">{leadName}</span>?
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
                className="rounded-lg border border-sky-700 bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                onClick={() => void confirmMove()}
                disabled={pending}
              >
                {pending ? "Moving…" : "Move to Patient Leads"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
