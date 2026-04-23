"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { staffListDeactivateAction, staffListPermanentDeleteAction } from "./actions";
import { CreateLoginDialog } from "./create-login-dialog";
import { EditStaffDialog } from "./edit-staff-dialog";
import { ResendInviteButton } from "./resend-invite-button";
import { ResetPasswordDialog } from "./reset-password-dialog";

type Props = {
  staffProfileId: string;
  hasLogin: boolean;
  isActive: boolean;
  viewerStaffProfileId: string;
  viewerIsSuperAdmin: boolean;
  initialFullName: string;
  initialEmail: string;
  initialSmsNotifyPhone: string | null;
};

const MENU_ITEM =
  "flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-100";

const DESTRUCTIVE =
  "flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-red-800 hover:bg-red-50";

const PRIMARY_CREATE =
  "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45";

const PRIMARY_RESET =
  "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-950 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45";

type ConfirmKind = "deactivate" | "permanent";

function StaffDirectoryRowActionsInner({
  staffProfileId,
  hasLogin,
  isActive,
  viewerStaffProfileId,
  viewerIsSuperAdmin,
  initialFullName,
  initialEmail,
  initialSmsNotifyPhone,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [toast, setToast] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);

  const canDeactivate = hasLogin && isActive && staffProfileId !== viewerStaffProfileId;
  const canPermanentDelete = staffProfileId !== viewerStaffProfileId && (!hasLogin || viewerIsSuperAdmin);

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

  useEffect(() => {
    if (!confirmKind) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmKind(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmKind]);

  const runDeactivate = useCallback(() => {
    startTransition(async () => {
      const r = await staffListDeactivateAction(staffProfileId);
      if (r.ok) {
        pushToast("ok", "Staff deactivated.");
        setConfirmKind(null);
        setMenuOpen(false);
        router.refresh();
      } else {
        pushToast("err", r.error);
      }
    });
  }, [staffProfileId, pushToast, router]);

  const runPermanentDelete = useCallback(() => {
    startTransition(async () => {
      const r = await staffListPermanentDeleteAction(staffProfileId);
      if (r.ok) {
        pushToast("ok", "Staff deleted");
        setConfirmKind(null);
        setMenuOpen(false);
        router.refresh();
      } else {
        pushToast("err", r.error);
      }
    });
  }, [staffProfileId, pushToast, router]);

  const confirmModal =
    confirmKind && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/45 p-4 sm:items-center"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConfirmKind(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {confirmKind === "deactivate" ? (
                <>
                  <h2 className="text-sm font-semibold text-slate-900">Deactivate staff?</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    This removes access but preserves the login and record.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-slate-900">Delete this staff?</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    This will permanently remove this staff record.
                  </p>
                </>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmKind(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {confirmKind === "deactivate" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={runDeactivate}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {isPending ? "…" : "Deactivate staff"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={runPermanentDelete}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {isPending ? "…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const menuPortal =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuPanelRef}
            role="menu"
            className="fixed z-40 max-h-[min(70vh,24rem)] min-w-[12.5rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
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
            ) : null}
            {canDeactivate || canPermanentDelete ? <div className="my-1 h-px bg-slate-100" /> : null}
            {canDeactivate ? (
              <button
                type="button"
                role="menuitem"
                className={DESTRUCTIVE}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmKind("deactivate");
                }}
              >
                Deactivate staff
              </button>
            ) : null}
            {canPermanentDelete ? (
              <button
                type="button"
                role="menuitem"
                className={DESTRUCTIVE}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmKind("permanent");
                }}
              >
                Delete permanently
              </button>
            ) : null}
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
      {confirmModal}
      {toastPortal}
    </div>
  );
}

export const StaffDirectoryRowActions = memo(StaffDirectoryRowActionsInner);
StaffDirectoryRowActions.displayName = "StaffDirectoryRowActions";
