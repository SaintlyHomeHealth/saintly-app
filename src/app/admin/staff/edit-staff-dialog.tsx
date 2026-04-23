"use client";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { updateStaffProfileIdentity } from "./actions";

import type { StaffRole } from "@/lib/staff-profile";

type Props = {
  staffProfileId: string;
  initialFullName: string;
  initialEmail: string;
  buttonClassName?: string;
  /** Primary trigger label (detail page uses “Edit identity”). */
  triggerLabel?: string;
  /** When set, explains Auth sync for email changes. */
  hasLogin?: boolean;
  /** Supabase Auth email for drift warning (optional). */
  authLoginEmail?: string | null;
  /** Detail page: include role in the same form. */
  showRoleField?: boolean;
  currentRole?: StaffRole;
  canAssignSuperAdmin?: boolean;
};

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "don", label: "DON" },
  { value: "nurse", label: "Nurse" },
  { value: "recruiter", label: "Recruiter" },
  { value: "billing", label: "Billing" },
  { value: "dispatch", label: "Dispatch" },
  { value: "credentialing", label: "Credentialing" },
  { value: "read_only", label: "Read-only" },
];

export function EditStaffDialog({
  staffProfileId,
  initialFullName,
  initialEmail,
  buttonClassName,
  triggerLabel = "Edit identity",
  hasLogin = false,
  authLoginEmail = null,
  showRoleField = false,
  currentRole = "manager",
  canAssignSuperAdmin = false,
}: Props) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
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

  const workNorm = normalizeStaffLookupEmail(initialEmail);
  const authNorm = normalizeStaffLookupEmail(authLoginEmail ?? "");
  const emailDrift = hasLogin && authNorm.length > 0 && workNorm.length > 0 && workNorm !== authNorm;

  const triggerClass =
    buttonClassName ??
    "inline-flex min-w-[7rem] items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50";

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
          className="my-auto w-full max-w-md rounded-[24px] border border-indigo-100/90 bg-white p-5 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-base font-bold text-slate-900">
            Edit identity
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Directory fields below are stored on <span className="font-semibold">staff_profiles</span> (source of truth
            for the staff list).{" "}
            {hasLogin ? (
              <>
                This person has a login: changing <span className="font-semibold">work email</span> updates{" "}
                <span className="font-semibold">Supabase Auth</span> first, then the staff row, so sign-in email and
                repair-login stay aligned. If Auth rejects the change, nothing is left half-updated.
              </>
            ) : (
              <>No login yet — updating email only changes this staff row.</>
            )}
          </p>
          {emailDrift ? (
            <p className="mt-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
              <span className="font-semibold">Mismatch:</span> work email ({initialEmail}) differs from Auth email (
              {authLoginEmail}). Saving will move Auth to match the work email you enter below. Use{" "}
              <span className="font-semibold">Repair login link</span> if they still cannot sign in.
            </p>
          ) : null}
          <form action={updateStaffProfileIdentity} className="mt-4 space-y-3">
            <input type="hidden" name="staffProfileId" value={staffProfileId} />
            {showRoleField ? <input type="hidden" name="includeRole" value="1" /> : null}
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
            {showRoleField ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Role</label>
                <select
                  name="role"
                  required
                  defaultValue={currentRole}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {canAssignSuperAdmin ? <option value="super_admin">Super admin</option> : null}
                </select>
              </div>
            ) : null}
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
    ) : null;

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
      >
        {triggerLabel}
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
