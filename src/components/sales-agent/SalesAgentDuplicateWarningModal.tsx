"use client";

import type { SalesAgentDuplicateHit } from "@/lib/sales-agent/sales-agent-lead-duplicate-check";
import {
  salesAgentDuplicateMatchHints,
  salesAgentDuplicateStatusLabel,
} from "@/lib/sales-agent/sales-agent-duplicate-display";

type Props = {
  open: boolean;
  duplicates: SalesAgentDuplicateHit[];
  pending?: boolean;
  onKeepEditing: () => void;
  onSubmitAnyway: () => void;
};

export function SalesAgentDuplicateWarningModal({
  open,
  duplicates,
  pending,
  onKeepEditing,
  onSubmitAnyway,
}: Props) {
  if (!open || duplicates.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
        <div
          className="w-full max-w-lg rounded-[24px] border border-amber-200 bg-white p-5 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-agent-duplicate-title"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
              <span className="text-lg font-bold" aria-hidden>
                !
              </span>
            </div>
            <div className="min-w-0">
              <h4 id="sales-agent-duplicate-title" className="text-base font-semibold text-slate-900">
                Possible duplicate found
              </h4>
              <p className="mt-1 text-sm text-slate-600">
                We found a possible existing lead for this patient. You can keep editing or submit anyway.
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {duplicates.map((d) => {
              const hints = salesAgentDuplicateMatchHints(d);
              return (
                <li
                  key={d.leadId}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-800"
                >
                  <div className="font-semibold text-slate-900">{d.patientName}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Status: {salesAgentDuplicateStatusLabel(d.status)}
                  </div>
                  {hints.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-950">
                      {hints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
              disabled={pending}
              onClick={onKeepEditing}
            >
              Keep Editing
            </button>
            <button
              type="button"
              className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 sm:w-auto"
              disabled={pending}
              onClick={onSubmitAnyway}
            >
              {pending ? "Submitting…" : "Submit Anyway"}
            </button>
          </div>
        </div>
    </div>
  );
}
