"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Phone, UserPlus } from "lucide-react";

import { QuickSaveContactSheet } from "@/components/workspace-phone/QuickSaveContactSheet";

import { WorkspaceHideCallButton } from "./WorkspaceHideCallButton";
import { WorkspaceMarkMissedResolvedButton } from "./WorkspaceMarkMissedResolvedButton";
import { displayNameFromContactsRelation } from "@/lib/crm/contact-relation-display-name";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { buildWorkspacePhoneLeadOpenHref } from "@/lib/crm/admin-crm-leads-list-url";
import {
  buildWorkspaceInboxNewSmsHref,
  buildWorkspaceKeypadCallHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

export type CallInboxRow = {
  id: string;
  created_at: string | null;
  /** Refreshed by DB trigger on writes; used for workspace calls list ordering. */
  updated_at?: string | null;
  started_at: string | null;
  ended_at: string | null;
  direction: string | null;
  from_e164: string | null;
  to_e164: string | null;
  status: string | null;
  external_call_id?: string | null;
  contact_id: string | null;
  contacts?: unknown;
  metadata?: unknown;
  primary_tag?: string | null;
  assigned_to_user_id?: string | null;
  workspace_missed_followup_resolved_at?: string | null;
  /** Set on the server via `resolvePhoneDisplayIdentityBatch`. */
  call_log_display?: {
    title: string;
    subtitlePhone: string;
    smsContactId: string | null;
    showQuickSave: boolean;
  };
  workspace_ui?: {
    directionLabel: string;
    statusLabel: string;
    aiCategoryLabel: string | null;
    aiSummaryShort: string | null;
    followUpLine: string | null;
    tagLine: string | null;
    openPatientId: string | null;
    openLeadId: string | null;
  };
};

function callbackNumber(direction: string | null, from: string | null, to: string | null): string | null {
  const dir = (direction ?? "").trim().toLowerCase();
  const f = (from ?? "").trim();
  const t = (to ?? "").trim();
  if (dir === "outbound") return t || null;
  return f || null;
}

function initialsForRow(displayTitle: string, numberFallback: string): string {
  const label = displayTitle.trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]!.charAt(0);
    const b = parts[parts.length - 1]!.charAt(0);
    if (a && b) return (a + b).toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  const d = numberFallback.replace(/\D/g, "");
  if (d.length >= 2) return d.slice(-2);
  if (d.length === 1) return d + "?";
  return "?";
}

type Props = {
  row: CallInboxRow;
  /** Admin / super_admin: hide test or bridge-polluted rows from Dispatch. */
  showHideFromDispatch?: boolean;
};

export function WorkspaceCallInboxCard({ row, showHideFromDispatch = false }: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveE164, setSaveE164] = useState("");
  const [saveResetKey, setSaveResetKey] = useState(0);
  const label =
    row.contacts != null ? displayNameFromContactsRelation(row.contacts) : null;
  const activityIsoForDisplay =
    typeof row.updated_at === "string" && row.updated_at.trim()
      ? row.updated_at
      : typeof row.created_at === "string"
        ? row.created_at
        : null;
  const when = formatAdminPhoneWhen(activityIsoForDisplay);
  const numRaw = callbackNumber(row.direction, row.from_e164, row.to_e164);
  const numberDisplay = numRaw ? formatPhoneForDisplay(numRaw) : "—";
  const pre = row.call_log_display;
  const cidRaw = pre?.smsContactId ?? row.contact_id;
  const cid = typeof cidRaw === "string" && cidRaw.trim() ? cidRaw.trim() : "";
  const title = pre?.title ?? label ?? numberDisplay;
  const subtitlePhone = pre?.subtitlePhone ?? numberDisplay;
  const isMissed = (row.status ?? "").trim().toLowerCase() === "missed";
  const missedResolved = Boolean(
    typeof row.workspace_missed_followup_resolved_at === "string" &&
      row.workspace_missed_followup_resolved_at.trim()
  );
  const initials = initialsForRow(title, subtitlePhone);
  const e164 = numRaw ? pickOutboundE164ForDial(numRaw) : null;
  const canDial = Boolean(e164);
  const callHref = canDial && e164 ? buildWorkspaceKeypadCallHref({ dial: e164, placeCall: false }) : null;
  const textHref = canDial
    ? buildWorkspaceInboxNewSmsHref({
        phone: e164 ?? undefined,
        contactId: cid || null,
        name: label ?? undefined,
      })
    : null;
  const pid = typeof row.id === "string" ? row.id.trim() : "";

  const ui = row.workspace_ui;
  const showMarkMissedResolved = isMissed && !missedResolved;
  const showFollowUpBadge = Boolean(ui?.followUpLine);

  const logCallback = () => {
    if (!pid) return;
    void fetch("/api/workspace/phone/log-callback-attempt", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_call_id: pid }),
    }).catch(() => {});
  };

  const openQuickSave = () => {
    if (e164) {
      setSaveE164(e164);
      setSaveResetKey((k) => k + 1);
      setSaveOpen(true);
    }
  };
  const canQuickSave = pre ? pre.showQuickSave : Boolean(e164) && !row.contact_id;

  const nameClass = isMissed
    ? "truncate text-[15px] font-semibold text-rose-900"
    : "truncate text-[15px] font-semibold text-phone-navy";

  const callBtnCls =
    "inline-flex h-10 min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 text-xs font-bold text-white shadow-md shadow-blue-900/20 transition hover:brightness-105 active:scale-[0.97] sm:flex-initial sm:px-4";
  const textBtnCls =
    "inline-flex h-10 min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-full border border-sky-200/90 bg-white px-3 text-xs font-semibold text-sky-950 shadow-sm transition hover:bg-sky-50 active:scale-[0.97] sm:flex-initial sm:px-4";
  const saveBtnCls =
    "inline-flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center gap-1 rounded-full border border-slate-200/90 bg-white px-2.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]";
  const openGhostCls =
    "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-violet-200/90 bg-violet-50/80 px-2.5 text-[11px] font-semibold text-violet-950 shadow-sm transition hover:bg-violet-100 active:scale-[0.97]";

  const rowBg =
    isMissed && !missedResolved
      ? "bg-rose-50/95"
      : isMissed
        ? "bg-rose-50/55"
        : "bg-white";

  return (
    <li className={`border-b border-slate-200/80 last:border-b-0 ${rowBg}`}>
      <div className="flex min-h-16 items-stretch gap-2 py-1 pr-1">
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-0 pr-1">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
              isMissed
                ? "bg-rose-200/90 text-rose-950 ring-1 ring-rose-300/80"
                : "bg-sky-100 text-sky-950 ring-1 ring-sky-200/70"
            }`}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className={`min-w-0 flex-1 ${nameClass}`}>{title}</p>
              <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400">{when}</span>
            </div>
            <p className="truncate font-mono text-[13px] tabular-nums text-slate-500">{subtitlePhone}</p>
            {ui ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                  {ui.directionLabel}
                </span>
                {isMissed ? (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Missed
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {ui.statusLabel}
                  </span>
                )}
                {ui.tagLine ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                    {ui.tagLine}
                  </span>
                ) : null}
                {ui.aiCategoryLabel ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-950">
                    AI: {ui.aiCategoryLabel}
                  </span>
                ) : null}
                {showFollowUpBadge ? (
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                    {ui.followUpLine}
                  </span>
                ) : null}
              </div>
            ) : null}
            {ui?.aiSummaryShort ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600">{ui.aiSummaryShort}</p>
            ) : null}
          </div>
        </div>
        <div className="flex max-w-[14rem] shrink-0 flex-col items-stretch justify-center gap-1.5 sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
          {showHideFromDispatch ? <WorkspaceHideCallButton callId={row.id} /> : null}
          {showMarkMissedResolved ? <WorkspaceMarkMissedResolvedButton callId={row.id} variant="compact" /> : null}
          {canQuickSave ? (
            <button
              type="button"
              onClick={openQuickSave}
              title="Save contact"
              aria-label={`Save contact ${subtitlePhone}`}
              className={saveBtnCls}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="hidden min-[360px]:inline">Save</span>
            </button>
          ) : null}
          {ui?.openPatientId ? (
            <Link href={`/workspace/phone/patients/${ui.openPatientId}`} className={openGhostCls} prefetch={false}>
              Patient
            </Link>
          ) : null}
          {ui?.openLeadId ? (
            (() => {
              const leadHref = buildWorkspacePhoneLeadOpenHref(ui.openLeadId);
              return leadHref ? (
                <Link href={leadHref} className={openGhostCls} prefetch={false}>
                  Lead
                </Link>
              ) : null;
            })()
          ) : null}
          {callHref ? (
            <Link
              href={callHref}
              onClick={() => {
                logCallback();
              }}
              title="Call"
              aria-label={`Call ${subtitlePhone}`}
              className={callBtnCls}
            >
              <Phone className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Call</span>
            </Link>
          ) : null}
          {textHref ? (
            <Link
              href={textHref}
              title="Text"
              aria-label={`Text ${subtitlePhone}`}
              className={textBtnCls}
            >
              <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Text</span>
            </Link>
          ) : null}
        </div>
      </div>
      {canQuickSave && saveOpen ? (
        <QuickSaveContactSheet
          open={saveOpen}
          onOpenChange={setSaveOpen}
          initialE164={saveE164}
          phoneCallId={pid}
          resetKey={saveResetKey}
        />
      ) : null}
    </li>
  );
}
