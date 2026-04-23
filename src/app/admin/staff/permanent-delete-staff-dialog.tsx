"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { permanentlyDeleteStaffUser } from "./actions";

type Props = {
  staffProfileId: string;
};

/**
 * One-step confirm + delete. Same rules and action as the staff list row menu.
 */
export function PermanentDeleteStaffDialog({ staffProfileId }: Props) {
  const titleId = useId();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [isPending, startTransition] = useTransition();

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

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

  const runDelete = useCallback(() => {
    startTransition(async () => {
      const r = await permanentlyDeleteStaffUser({ staffId: staffProfileId });
      if (r.ok) {
        setOpen(false);
        router.replace("/admin/staff?ok=staff_deleted");
        router.refresh();
      } else {
        setToast({ kind: "err", text: r.error });
        setOpen(false);
      }
    });
  }, [staffProfileId, router]);

  const modal =
    open && typeof document !== "undefined" ? (
      <div
        className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Delete this staff permanently?
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={runDelete}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {isPending ? "…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const toastPortal =
    toast && typeof document !== "undefined"
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`fixed bottom-4 left-1/2 z-[200] max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-lg [overflow-wrap:anywhere] ${
              toast.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-red-200 bg-red-50 text-red-950"
            }`}
          >
            {toast.text}
          </div>,
          document.body
        )
      : null;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-900 hover:bg-red-100"
      >
        Delete permanently
      </button>
      {modal ? createPortal(modal, document.body) : null}
      {toastPortal}
    </div>
  );
}
