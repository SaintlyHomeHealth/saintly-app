"use client";

import Link from "next/link";

import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
} from "@/lib/workspace-phone/launch-urls";

const btnPrimary =
  "inline-flex min-h-[36px] flex-1 items-center justify-center rounded-xl bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost =
  "inline-flex min-h-[36px] flex-1 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  leadId: string;
  contactId: string;
  /** E.164 or normalizable dial string for the Twilio keypad. */
  dialE164: string | null;
  hasSmsCapablePhone: boolean;
  displayName: string;
};

export function WorkspaceLeadRowActions({ leadId, contactId, dialE164, hasSmsCapablePhone, displayName }: Props) {
  const keypadCallHref = dialE164
    ? buildWorkspaceKeypadCallHref({
        dial: dialE164,
        leadId,
        contactId,
        contextName: displayName,
      })
    : null;

  const smsHref = hasSmsCapablePhone
    ? buildWorkspaceSmsToContactHref({ contactId, leadId })
    : null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {keypadCallHref ? (
        <Link href={keypadCallHref} className={btnPrimary} prefetch={false}>
          Call
        </Link>
      ) : (
        <span className={`${btnPrimary} flex-1 cursor-not-allowed opacity-40`}>No phone</span>
      )}
      {smsHref ? (
        <Link href={smsHref} className={btnGhost} prefetch={false}>
          Text
        </Link>
      ) : (
        <span className={`${btnGhost} flex-1 cursor-not-allowed text-slate-400`}>No SMS phone</span>
      )}
      <Link href={`/admin/crm/leads/${leadId}`} className={btnGhost} prefetch={false}>
        Open
      </Link>
    </div>
  );
}
