"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Phone, UserPlus } from "lucide-react";

import { QuickSaveContactSheet } from "@/components/workspace-phone/QuickSaveContactSheet";

import { WorkspaceMarkMissedResolvedButton } from "./WorkspaceMarkMissedResolvedButton";
import { displayNameFromContactsRelation } from "@/lib/crm/contact-relation-display-name";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
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
  started_at?: string | null;
  ended_at?: string | null;
  direction: string | null;
  from_e164: string | null;
  to_e164: string | null;
  status: string | null;
  external_call_id?: string | null;
  contact_id: string | null;
  contacts?: unknown;
  metadata?: unknown;
  /** Set on the server via `resolvePhoneDisplayIdentityBatch`. */
  call_log_display?: {
    title: string;
    subtitlePhone: string;
    smsContactId: string | null;
    showQuickSave: boolean;
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
  variant: "missed" | "recent";
};

export function WorkspaceCallInboxCard({ row, variant }: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveE164, setSaveE164] = useState("");
  const [saveResetKey, setSaveResetKey] = useState(0);
  const label = displayNameFromContactsRelation(row.contacts);
  const activityIsoForDisplay =
    variant === "recent"
      ? typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : null
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
  const missed = variant === "missed";
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

  const nameClass = missed
    ? "truncate text-[15px] font-semibold text-rose-700"
    : "truncate text-[15px] font-semibold text-phone-navy";

  const callBtnCls =
    "inline-flex h-10 min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 text-xs font-bold text-white shadow-md shadow-blue-900/20 transition hover:brightness-105 active:scale-[0.97] sm:flex-initial sm:px-4";
  const textBtnCls =
    "inline-flex h-10 min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-full border border-sky-200/90 bg-white px-3 text-xs font-semibold text-sky-950 shadow-sm transition hover:bg-sky-50 active:scale-[0.97] sm:flex-initial sm:px-4";
  const saveBtnCls =
    "inline-flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center gap-1 rounded-full border border-slate-200/90 bg-white px-2.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]";

  return (
    <li className="border-b border-slate-200/80 last:border-b-0">
      <div className="flex min-h-16 items-stretch gap-2 py-1 pr-1">
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-0 pr-1">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
              missed
                ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200/80"
                : "bg-sky-100 text-sky-950 ring-1 ring-sky-200/70"
            }`}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className={nameClass}>{title}</p>
            <p className="truncate font-mono text-[13px] tabular-nums text-slate-500">{subtitlePhone}</p>
            <p className="text-[11px] font-medium text-slate-400">{when}</p>
          </div>
        </div>
        <div className="flex max-w-[14rem] shrink-0 flex-col items-stretch justify-center gap-1.5 sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
          {missed ? <WorkspaceMarkMissedResolvedButton callId={row.id} variant="compact" /> : null}
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
