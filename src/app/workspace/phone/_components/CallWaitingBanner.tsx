"use client";

import { PhoneCall, PhoneOff } from "lucide-react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { isPlausiblePstnCallerRawForSubline } from "@/lib/softphone/twilio-incoming-caller-display";

/**
 * Second inbound while already on an active call (call waiting).
 * Hold & Accept (conference) is Phase 2 — button is visible but disabled with explanation.
 */
export function CallWaitingBanner() {
  const {
    callWaiting,
    callWaitingCallerContactName,
    callWaitingNumberFormatted,
    callWaitingRawFrom,
    answerCallWaitingEndAndAccept,
    declineCallWaiting,
  } = useWorkspaceSoftphone();

  if (!callWaiting) return null;

  const titleLine = callWaitingCallerContactName ?? (callWaitingNumberFormatted || "Unknown caller");
  const subLine =
    callWaitingCallerContactName && callWaitingNumberFormatted
      ? callWaitingNumberFormatted
      : isPlausiblePstnCallerRawForSubline(callWaitingRawFrom) &&
          callWaitingNumberFormatted &&
          callWaitingRawFrom !== callWaitingNumberFormatted
        ? callWaitingRawFrom
        : null;

  return (
    <div className="fixed left-0 right-0 top-[8.25rem] z-[46] px-4 sm:top-[8.5rem] sm:px-5">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 via-white to-amber-50/90 p-3 shadow-lg shadow-amber-900/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">Another call</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-phone-navy">{titleLine}</p>
            {subLine ? (
              <p className="truncate font-mono text-xs font-medium text-slate-600">{subLine}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled
              title="Requires conference calling (next release)"
              className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-3 text-sm font-semibold text-slate-400"
            >
              Hold &amp; Accept
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={declineCallWaiting}
                className="inline-flex h-10 items-center gap-1 rounded-full border border-sky-200/90 bg-white px-3 text-sm font-semibold text-phone-ink hover:bg-phone-ice"
              >
                <PhoneOff className="h-4 w-4" strokeWidth={2} />
                Decline
              </button>
              <button
                type="button"
                onClick={answerCallWaitingEndAndAccept}
                className="inline-flex h-10 items-center gap-1 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 text-sm font-semibold text-white shadow-md shadow-blue-900/25 hover:brightness-105"
              >
                <PhoneCall className="h-4 w-4" strokeWidth={2} />
                End &amp; Accept
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-amber-950/80">
          End &amp; Accept hangs up your current call, then answers this one. Hold &amp; Accept needs conference
          calling and will ship in a follow-up.
        </p>
      </div>
    </div>
  );
}
