"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CreateLoginDialog } from "./create-login-dialog";
import { EditStaffDialog } from "./edit-staff-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResendInviteButton } from "./resend-invite-button";
import { ResetPasswordDialog } from "./reset-password-dialog";

type Props = {
  staffProfileId: string;
  hasLogin: boolean;
  label: string;
  initialFullName: string;
  initialEmail: string;
  initialSmsNotifyPhone: string | null;
};

const MENU_ITEM =
  "flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-100";

const PRIMARY_CREATE =
  "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45";

const PRIMARY_RESET =
  "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-950 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45";

function StaffDirectoryRowActionsInner({
  staffProfileId,
  hasLogin,
  label,
  initialFullName,
  initialEmail,
  initialSmsNotifyPhone,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [toast, setToast] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const pushToast = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useLayoutEffect(() => {
    if (!menuOpen || !anchorRef.current) return;
    function place() {
      if (!anchorRef.current) return;
      const r = anchorRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const menuPortal =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuPanelRef}
            role="menu"
            className="fixed z-40 max-h-[min(70vh,24rem)] min-w-[13.75rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <Link
              href={`/admin/staff/${staffProfileId}`}
              role="menuitem"
              className={`${MENU_ITEM} text-indigo-900 hover:bg-indigo-50/80`}
              onClick={() => setMenuOpen(false)}
            >
              Open profile
            </Link>
            <div
              className="px-1 py-1"
              onClick={() => {
                setMenuOpen(false);
              }}
            >
              <EditStaffDialog
                staffProfileId={staffProfileId}
                initialFullName={initialFullName}
                initialEmail={initialEmail}
                hasLogin={hasLogin}
                triggerLabel="Edit"
                buttonClassName={MENU_ITEM}
              />
            </div>
            {hasLogin ? (
              <>
                <div className="px-1 py-1">
                  <ResendInviteButton
                    staffProfileId={staffProfileId}
                    className={`${MENU_ITEM} !inline-flex min-h-[2.25rem] border-0 bg-transparent font-semibold shadow-none hover:!bg-slate-100`}
                    onResult={(kind, msg) => {
                      pushToast(kind, msg);
                      setMenuOpen(false);
                    }}
                  />
                </div>
              </>
            ) : null}
            <div className="my-1 h-px bg-slate-100" />
            <div
              className="px-1 py-1"
              onClick={() => {
                setMenuOpen(false);
              }}
            >
              <RemoveStaffDialog
                staffProfileId={staffProfileId}
                hasLogin={hasLogin}
                label={label}
                triggerLabel={hasLogin ? "Disable staff" : "Remove staff row"}
                buttonClassName={`${MENU_ITEM} text-red-900 hover:bg-red-50`}
              />
            </div>
          </div>,
          document.body
        )
      : null;

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
    <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-1.5">
      {hasLogin ? (
        <ResetPasswordDialog
          staffProfileId={staffProfileId}
          triggerClassName={PRIMARY_RESET}
          onApiResult={pushToast}
          onBeforeOpen={() => setMenuOpen(false)}
          initialSmsNotifyPhone={initialSmsNotifyPhone}
          offerAutomaticDelivery
        />
      ) : (
        <CreateLoginDialog
          staffProfileId={staffProfileId}
          triggerClassName={PRIMARY_CREATE}
          onApiResult={pushToast}
          onBeforeOpen={() => setMenuOpen(false)}
          initialEmail={initialEmail}
          initialSmsNotifyPhone={initialSmsNotifyPhone}
        />
      )}
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((o) => !o)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg leading-none text-slate-600 hover:bg-slate-50"
        title="More actions"
      >
        ···
      </button>
      {menuPortal}
      {toastPortal}
    </div>
  );
}

export const StaffDirectoryRowActions = memo(StaffDirectoryRowActionsInner);
StaffDirectoryRowActions.displayName = "StaffDirectoryRowActions";
