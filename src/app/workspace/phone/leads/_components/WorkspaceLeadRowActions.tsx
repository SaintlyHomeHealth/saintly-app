"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buildWorkspacePhoneLeadOpenHref } from "@/lib/crm/admin-crm-leads-list-url";
import {
  isValidCrmLeadId,
  logCrmLeadIdDebugClient,
  normalizeCrmLeadId,
  sendCrmLeadIdDebugBeacon,
} from "@/lib/crm/crm-lead-id";
import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
} from "@/lib/workspace-phone/launch-urls";

const btnPrimary =
  "inline-flex min-h-[36px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity:40";
const btnGhost =
  "inline-flex min-h-[36px] flex-1 items-center justify-center rounded-xl border border-sky-200/90 bg-white px-2 py-1.5 text-[11px] font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  /** Exact `leads.id` from server row (before client normalization). */
  leadId: string;
  /** Same as leadId when passed from server; used for debug diff. */
  rawLeadIdFromDb?: string;
  contactId: string;
  dialE164: string | null;
  hasSmsCapablePhone: boolean;
  displayName: string;
};

export function WorkspaceLeadRowActions({
  leadId,
  rawLeadIdFromDb,
  contactId,
  dialE164,
  hasSmsCapablePhone,
  displayName,
}: Props) {
  const rawFromDb = (rawLeadIdFromDb ?? leadId).trim();
  const leadIdNorm = normalizeCrmLeadId(leadId);
  const leadIdValid = isValidCrmLeadId(leadIdNorm);
  const openHref = leadIdValid ? buildWorkspacePhoneLeadOpenHref(leadIdNorm) : null;

  useEffect(() => {
    logCrmLeadIdDebugClient("workspace_open_row_mount", {
      rawFromDb,
      idPassedToClient: leadId,
      normalized: leadIdNorm,
      openHref,
    });
  }, [rawFromDb, leadId, leadIdNorm, openHref]);

  const debugOpenClick = () => {
    logCrmLeadIdDebugClient("workspace_open_button_click", {
      rawFromDb,
      idPassedToClient: leadId,
      normalized: leadIdNorm,
      openHref,
    });
    sendCrmLeadIdDebugBeacon({
      context: "workspace_open_button_click",
      rawFromDb,
      idPassedToClient: leadId,
      normalized: leadIdNorm,
      openHref,
      displayNameHint: displayName.slice(0, 40),
    });
  };

  const keypadCallHref =
    leadIdValid && dialE164
      ? buildWorkspaceKeypadCallHref({
          dial: dialE164,
          leadId: leadIdNorm,
          contactId,
          contextName: displayName,
        })
      : dialE164
        ? buildWorkspaceKeypadCallHref({
            dial: dialE164,
            contactId,
            contextName: displayName,
          })
        : null;

  const smsHref =
    hasSmsCapablePhone && isValidCrmLeadId(contactId)
      ? buildWorkspaceSmsToContactHref({
          contactId,
          ...(leadIdValid ? { leadId: leadIdNorm } : {}),
        })
      : null;

  const debugOn = process.env.NEXT_PUBLIC_CRM_LEADS_ID_DEBUG === "1";

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
      {openHref ? (
        <Link
          href={openHref}
          className={btnGhost}
          prefetch={false}
          data-crm-lead-id-raw={rawFromDb}
          data-crm-lead-id-client={leadId}
          data-crm-lead-open-href={openHref}
          onClick={debugOpenClick}
        >
          Open
        </Link>
      ) : (
        <span className={`${btnGhost} flex-1 cursor-not-allowed text-rose-700`} title="Invalid lead ID">
          Invalid lead ID
        </span>
      )}
      {debugOn && openHref ? (
        <p className="w-full font-mono text-[9px] leading-tight text-slate-500 break-all" aria-hidden>
          dbg id: {leadIdNorm}
        </p>
      ) : null}
    </div>
  );
}
