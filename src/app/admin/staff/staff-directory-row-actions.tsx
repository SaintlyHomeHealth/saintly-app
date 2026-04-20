"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
};

export function StaffDirectoryRowActions({
  staffProfileId,
  hasLogin,
  label,
  initialFullName,
  initialEmail,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const menuBtn =
    "w-full rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-100";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href={`/admin/staff/${staffProfileId}`}
        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
      >
        Open
      </Link>
      <CreateLoginDialog staffProfileId={staffProfileId} compact disabled={hasLogin} />
      <ResetPasswordDialog staffProfileId={staffProfileId} compact disabled={!hasLogin} />
      <RemoveStaffDialog
        staffProfileId={staffProfileId}
        hasLogin={hasLogin}
        label={label}
        triggerLabel={hasLogin ? "Disable staff" : "Remove"}
      />
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
          title="More actions"
        >
          ···
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 min-w-[13.5rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            <EditStaffDialog
              staffProfileId={staffProfileId}
              initialFullName={initialFullName}
              initialEmail={initialEmail}
              buttonClassName={menuBtn}
            />
            {hasLogin ? (
              <>
                <div className="px-1 py-1">
                  <ResetPasswordDialog
                    staffProfileId={staffProfileId}
                    defaultAutoGenerate
                    triggerLabel="Regenerate temporary password"
                    dialogTitle="Regenerate temporary password"
                    triggerClassName={menuBtn}
                  />
                </div>
                <div className="px-1 py-1">
                  <ResendInviteButton
                    staffProfileId={staffProfileId}
                    className={`${menuBtn} !justify-start border-0 bg-transparent`}
                  />
                </div>
              </>
            ) : (
              <p className="px-2 py-2 text-[10px] leading-snug text-slate-500">
                Create a login to use regenerate password and resend invite from this menu.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
