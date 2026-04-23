"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { permanentlyDeleteStaffUser } from "./actions";

type Props = {
  staffProfileId: string;
  label: string;
  workEmail: string;
  hasLogin: boolean;
};

export function PermanentDeleteStaffDialog({ staffProfileId, label, workEmail, hasLogin }: Props) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");

  const close = useCallback(() => {
    setOpen(false);
    setAck(false);
    setPhrase("");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const emailHint = (workEmail ?? "").trim() || "—";

  const modal =
    open && typeof document !== "undefined" ? (
      <div
        className="fixed inset-0 z-[130] flex max-h-[100dvh] items-end justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center sm:p-6"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="my-auto w-full max-w-md rounded-[24px] border border-rose-200/90 bg-white p-5 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-base font-bold text-rose-950">
            Delete permanently
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">
            This is for <span className="font-semibold">accidental or test rows</span>, not normal offboarding. Use{" "}
            <span className="font-semibold">Deactivate staff</span> when someone should lose access but history must stay
            intact.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-slate-700">
            <li>Removes this staff directory row from the database.</li>
            {hasLogin ? (
              <li>
                Deletes the <span className="font-semibold">Supabase Auth</span> login — they cannot sign in; email may be
                reused for a new user.
              </li>
            ) : (
              <li>No Auth user — only the placeholder row is removed.</li>
            )}
            <li>
              <span className="font-semibold">Blocked</span> if a payroll employee link exists — clear the link on this
              staff row first.
            </li>
            <li>Does not delete applicant/employee records; only the staff access row (and Auth when linked).</li>
          </ul>
          <p className="mt-2 text-xs text-slate-800">
            Staff: <span className="font-semibold">{label}</span>
            <br />
            Work email on row: <span className="font-mono text-[11px]">{emailHint}</span>
          </p>
          <form action={permanentlyDeleteStaffUser} className="mt-4 space-y-3">
            <input type="hidden" name="staffProfileId" value={staffProfileId} />
            <label className="block text-[11px] font-semibold text-slate-700">
              Type <span className="font-mono font-bold">DELETE</span> or the exact work email to confirm
              <input
                name="confirmPhrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                placeholder="DELETE or email"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                name="confirmed"
                value="1"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>I understand this cannot be undone.</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={!ack || !phrase.trim()}
                className="rounded-full bg-rose-800 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete permanently
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
    ) : null;

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
          setAck(false);
          setPhrase("");
        }}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-950 hover:bg-rose-100"
      >
        Delete permanently
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
