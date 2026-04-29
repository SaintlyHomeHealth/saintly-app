"use client";

import { useState } from "react";

import { hardDeleteFaxAction, softDeleteFaxAction } from "@/app/admin/fax/actions";
import { crmActionBtnMuted, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

type DeleteFaxButtonProps = {
  faxId: string;
  returnTo: string;
  allowHardDelete: boolean;
  compact?: boolean;
};

export function DeleteFaxButton({ faxId, returnTo, allowHardDelete, compact = false }: DeleteFaxButtonProps) {
  const [open, setOpen] = useState(false);
  const softLabel = compact ? "Delete" : "Delete fax";
  const buttonClass = compact ? "rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100" : crmActionBtnMuted;

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {softLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="space-y-2">
              <p className="text-base font-bold text-slate-900">Delete fax</p>
              <p className="text-sm text-slate-600">
                Delete will archive this fax and remove it from the inbox.
                {allowHardDelete ? " Admins can also permanently delete the fax and its stored PDF." : ""}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={crmActionBtnMuted} onClick={() => setOpen(false)}>
                Cancel
              </button>

              <form action={softDeleteFaxAction}>
                <input type="hidden" name="faxId" value={faxId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" className={crmActionBtnMuted}>
                  Archive instead
                </button>
              </form>

              {allowHardDelete ? (
                <form
                  action={hardDeleteFaxAction}
                  onSubmit={(event) => {
                    const confirmed = window.confirm("This will permanently delete the fax and cannot be undone.");
                    if (!confirmed) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="faxId" value={faxId} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button type="submit" className={crmPrimaryCtaCls}>
                    Permanently delete
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
