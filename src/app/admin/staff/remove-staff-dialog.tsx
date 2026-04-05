"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { removeStaffRecord } from "./actions";

type Props = {
  staffProfileId: string;
  hasLogin: boolean;
  label: string;
};

export function RemoveStaffDialog({ staffProfileId, hasLogin, label }: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setAck(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const title = hasLogin ? "Deactivate staff" : "Remove staff row";
  const verb = hasLogin ? "Deactivate" : "Remove";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setAck(false);
        }}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-red-200 bg-red-50/80 px-3 py-1.5 text-[11px] font-semibold text-red-900 hover:bg-red-100"
      >
        {hasLogin ? "Deactivate" : "Remove"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-[24px] border border-indigo-100/90 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h2>
            {hasLogin ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-800">{label}</span> has a linked login. For safety, this only{" "}
                <span className="font-semibold">deactivates</span> the staff row (blocks app access). The Supabase Auth
                user is not deleted, so assignments, visit history, and audit trails that reference that account stay
                intact. Use the Active toggle later if you need to re-enable them.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                This removes the placeholder row for <span className="font-semibold text-slate-800">{label}</span>. There
                is no login linked yet, so this is a full delete from the staff directory.
              </p>
            )}
            <form action={removeStaffRecord} className="mt-4 space-y-3">
              <input type="hidden" name="staffProfileId" value={staffProfileId} />
              <input type="hidden" name="confirmed" value={ack ? "1" : "0"} />
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>I understand — {verb.toLowerCase()} this staff record.</span>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!ack}
                  className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {verb}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
