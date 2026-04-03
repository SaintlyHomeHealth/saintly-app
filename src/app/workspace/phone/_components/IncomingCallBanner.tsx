"use client";

import { PhoneCall, PhoneOff } from "lucide-react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { isPlausiblePstnCallerRawForSubline } from "@/lib/softphone/twilio-incoming-caller-display";

export function IncomingCallBanner() {
  const {
    incoming,
    incomingCallerContactName,
    incomingCallerNumberFormatted,
    incomingCallerRawFrom,
    answerIncoming,
    rejectIncoming,
  } = useWorkspaceSoftphone();

  if (!incoming) return null;

  const titleLine = incomingCallerContactName ?? (incomingCallerNumberFormatted || "Unknown caller");
  const subLine =
    incomingCallerContactName && incomingCallerNumberFormatted
      ? incomingCallerNumberFormatted
      : isPlausiblePstnCallerRawForSubline(incomingCallerRawFrom) &&
          incomingCallerNumberFormatted &&
          incomingCallerRawFrom !== incomingCallerNumberFormatted
        ? incomingCallerRawFrom
        : null;

  return (
    <div className="fixed left-0 right-0 top-[4.85rem] z-[45] px-4 sm:px-5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg shadow-slate-300/40">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">Incoming call</p>
          <p className="truncate text-sm font-semibold text-slate-900">{titleLine}</p>
          {subLine ? (
            <p className="truncate font-mono text-xs font-medium text-slate-600">{subLine}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={rejectIncoming}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <PhoneOff className="h-4 w-4" strokeWidth={2} />
            Decline
          </button>
          <button
            type="button"
            onClick={answerIncoming}
            className="inline-flex h-10 items-center gap-1 rounded-full bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <PhoneCall className="h-4 w-4" strokeWidth={2} />
            Answer
          </button>
        </div>
      </div>
    </div>
  );
}
