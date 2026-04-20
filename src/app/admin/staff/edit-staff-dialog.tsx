"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { updateStaffProfileIdentity } from "./actions";

type Props = {
  staffProfileId: string;
  initialFullName: string;
  initialEmail: string;
  /** Replaces default trigger button classes (e.g. menu row). */
  buttonClassName?: string;
};

export function EditStaffDialog({
  staffProfileId,
  initialFullName,
  initialEmail,
  buttonClassName,
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
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
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "inline-flex min-w-[7rem] items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
        }
      >
        Edit
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
              Edit staff
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Updates the directory name and work email. If this person has a login, a work email change also updates
              Supabase Auth so sign-in and repair-login stay in sync.
            </p>
            <form action={updateStaffProfileIdentity} className="mt-4 space-y-3">
              <input type="hidden" name="staffProfileId" value={staffProfileId} />
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Full name</label>
                <input
                  name="fullName"
                  required
                  defaultValue={initialFullName}
                  key={`${staffProfileId}-fn-${open}`}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Work email</label>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={initialEmail}
                  key={`${staffProfileId}-em-${open}`}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Save
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
