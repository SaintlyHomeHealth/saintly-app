"use client";

import { CircleDot, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  WORKSPACE_SOFTPHONE_UI_EVENT,
  type WorkspaceSoftphoneUiDetail,
} from "@/lib/softphone/workspace-ui-events";

type Props = {
  displayName: string;
  inboundRingEnabled: boolean;
};

export function WorkspacePhoneTopStatusStrip({ displayName, inboundRingEnabled }: Props) {
  const [ui, setUi] = useState<WorkspaceSoftphoneUiDetail>({ phase: "idle" });

  useEffect(() => {
    const onEv = (e: Event) => {
      const ce = e as CustomEvent<WorkspaceSoftphoneUiDetail>;
      if (ce.detail && typeof ce.detail.phase === "string") {
        setUi(ce.detail);
      }
    };
    window.addEventListener(WORKSPACE_SOFTPHONE_UI_EVENT, onEv as EventListener);
    return () => window.removeEventListener(WORKSPACE_SOFTPHONE_UI_EVENT, onEv as EventListener);
  }, []);

  const status = useMemo(() => {
    if (!inboundRingEnabled) return { label: "Ready (limited)", tone: "text-amber-900 bg-amber-100 border-amber-200" };
    if (ui.phase === "incoming" || ui.phase === "active") {
      return {
        label: ui.phase === "incoming" ? "Incoming call" : "On call",
        tone: "text-phone-live bg-phone-live-bg border-sky-300/80",
      };
    }
    if (ui.phase === "outbound_ringing") {
      return { label: "Connecting", tone: "text-phone-ink bg-sky-100 border-sky-200/90" };
    }
    return { label: "Ready for calls", tone: "text-phone-ink bg-phone-ice border-phone-border" };
  }, [inboundRingEnabled, ui.phase]);

  return (
    <div className="mx-auto mt-2 w-full max-w-6xl px-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100/80 bg-white/90 px-3 py-2.5 shadow-sm shadow-sky-950/5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-700">Signed in: {displayName}</p>
          {ui.remoteLabel ? <p className="truncate text-[11px] text-slate-500">{ui.remoteLabel}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}>
            {inboundRingEnabled ? <CircleDot className="h-3.5 w-3.5" strokeWidth={2} /> : <WifiOff className="h-3.5 w-3.5" strokeWidth={2} />}
            {status.label}
          </span>
          {inboundRingEnabled ? (
            <p className="max-w-[14rem] text-right text-[10px] leading-snug text-slate-400">
              Browser softphone: keep this app open. Background or locked mobile usually will not ring (no native
              incoming-call push).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
