"use client";

import Link from "next/link";
import { Phone } from "lucide-react";

import { WorkspaceMarkMissedResolvedButton } from "./WorkspaceMarkMissedResolvedButton";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  buildWorkspaceKeypadCallHref,
  pickOutboundE164ForDial,
  buildWorkspaceSmsToContactHref,
} from "@/lib/workspace-phone/launch-urls";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

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
};

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

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

function detailHref(opts: {
  patientId: string | null;
  contactId: string;
  dial: string | null;
}): string {
  if (opts.patientId) return `/workspace/phone/patients/${opts.patientId}`;
  if (opts.contactId) return buildWorkspaceSmsToContactHref({ contactId: opts.contactId });
  if (opts.dial && pickOutboundE164ForDial(opts.dial))
    return buildWorkspaceKeypadCallHref({ dial: opts.dial, placeCall: false });
  return "/workspace/phone/keypad";
}

type Props = {
  row: CallInboxRow;
  variant: "missed" | "recent";
  patientId: string | null;
};

export function WorkspaceCallInboxCard({ row, variant, patientId }: Props) {
  const label = crmDisplayNameFromContactsRaw(row.contacts);
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
  const cid = typeof row.contact_id === "string" ? row.contact_id : "";
  const title = label ?? numberDisplay;
  const missed = variant === "missed";
  const initials = initialsForRow(title, numberDisplay);
  const rowTo = detailHref({ patientId, contactId: cid, dial: numRaw });
  const canDial = Boolean(numRaw && pickOutboundE164ForDial(numRaw));
  const callHref = canDial && numRaw ? buildWorkspaceKeypadCallHref({ dial: numRaw, placeCall: true }) : null;
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

  const nameClass = missed
    ? "truncate text-[15px] font-semibold text-rose-700"
    : "truncate text-[15px] font-semibold text-phone-navy";

  return (
    <li className="border-b border-slate-200/80 last:border-b-0">
      <div className="flex h-16 max-h-16 min-h-16 items-stretch gap-2 pr-1">
        <Link
          href={rowTo}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-0 pr-1 transition active:bg-slate-50/80"
        >
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
            <p className="truncate font-mono text-[13px] tabular-nums text-slate-500">{numberDisplay}</p>
            <p className="text-[11px] font-medium text-slate-400">{when}</p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {missed ? <WorkspaceMarkMissedResolvedButton callId={row.id} variant="compact" /> : null}
          {callHref ? (
            <Link
              href={callHref}
              onClick={(e) => {
                e.stopPropagation();
                logCallback();
              }}
              title="Call"
              aria-label={`Call ${numberDisplay}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-sky-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 active:scale-[0.97]"
            >
              <Phone className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
