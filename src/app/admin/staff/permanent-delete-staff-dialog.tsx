"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { permanentlyDeleteStaffUser } from "./actions";

type Props = {
  staffProfileId: string;
  label: string;
};

export function PermanentDeleteStaffDialog({ staffProfileId, label }: Props) {
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

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setAck(false);
        }}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-950 hover:bg-rose-100"
      >
        Permanent delete
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
            className="w-full max-w-md rounded-[24px] border border-rose-200/90 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              Permanent delete
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              This will permanently delete this user and related onboarding/login records. This cannot be undone.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">{label}</span> will be removed from Supabase Auth so their
              email can be reused. If this login is linked to an employee (applicant) record, that employee record and
              dependent onboarding data are deleted as well.
            </p>
            <form action={permanentlyDeleteStaffUser} className="mt-4 space-y-3">
              <input type="hidden" name="staffProfileId" value={staffProfileId} />
              <input type="hidden" name="confirmed" value={ack ? "1" : "0"} />
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>I understand — permanently delete this user.</span>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!ack}
                  className="rounded-full bg-rose-800 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Permanent delete
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
