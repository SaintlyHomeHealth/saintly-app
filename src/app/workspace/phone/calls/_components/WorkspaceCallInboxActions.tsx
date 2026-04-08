"use client";

import { MessageSquare, Phone, UserRound } from "lucide-react";
import Link from "next/link";

import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

const btnBase =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.99] sm:flex-none sm:min-w-[7.5rem]";

type Props = {
  callbackE164: string | null;
  contactId: string | null;
  patientId: string | null;
};

export function WorkspaceCallInboxActions({ callbackE164, contactId, patientId }: Props) {
  const dial = typeof callbackE164 === "string" ? callbackE164.trim() : "";
  const callHref = dial && pickOutboundE164ForDial(dial) ? buildWorkspaceKeypadCallHref({ dial, placeCall: true }) : null;
  const smsHref = contactId ? buildWorkspaceSmsToContactHref({ contactId }) : null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {callHref ? (
        <Link
          href={callHref}
          className={`${btnBase} border-sky-400/40 bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 text-white shadow-md shadow-blue-900/25 hover:brightness-105`}
        >
          <Phone className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Call back
        </Link>
      ) : null}
      {contactId && smsHref ? (
        <Link
          href={smsHref}
          className={`${btnBase} border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100`}
        >
          <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Text
        </Link>
      ) : null}
      {patientId ? (
        <Link
          href={`/workspace/phone/patients/${patientId}`}
          className={`${btnBase} border-sky-200/90 bg-white text-phone-ink hover:bg-phone-ice`}
        >
          <UserRound className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Patient
        </Link>
      ) : null}
    </div>
  );
}
