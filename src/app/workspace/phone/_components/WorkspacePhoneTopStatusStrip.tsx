"use client";

import { CircleDot, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname() ?? "";
  /** Desktop 3-pane inbox list only — hardest compact strip (not `/inbox/[id]` drill-in). */
  const inboxListDesktop = pathname === "/workspace/phone/inbox";
  const inboxCompact = inboxListDesktop || pathname.startsWith("/workspace/phone/inbox/");
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

  const innerCardClass = inboxListDesktop
    ? "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100/80 bg-white/90 px-3 py-2.5 backdrop-blur lg:rounded-md lg:border-slate-200/80 lg:px-2.5 lg:py-1.5 lg:shadow-none"
    : `flex flex-wrap items-center justify-between gap-2 border border-sky-100/80 bg-white/90 px-3 py-2.5 backdrop-blur ${
        inboxCompact
          ? "rounded-xl shadow-none lg:rounded-lg lg:border-slate-200/70 lg:py-2 lg:shadow-none"
          : "rounded-2xl shadow-sm shadow-sky-950/5"
      }`;

  return (
    <div
      className={`mx-auto mt-2 w-full px-4 sm:px-5 ${inboxCompact ? "max-w-none lg:mt-1 lg:px-3" : "max-w-6xl"} ${
        inboxListDesktop ? "lg:mt-0 lg:px-3" : ""
      }`}
    >
      <div className={innerCardClass}>
        <div className={`min-w-0 ${inboxListDesktop ? "lg:hidden" : ""}`}>
          <p className="truncate text-xs font-semibold text-slate-700">Signed in: {displayName}</p>
          {ui.remoteLabel ? <p className="truncate text-[11px] text-slate-500">{ui.remoteLabel}</p> : null}
        </div>
        <div
          className={`flex min-w-0 flex-1 flex-col items-end gap-1 sm:flex-initial ${
            inboxListDesktop ? "lg:w-full lg:flex-row lg:items-center lg:justify-between lg:gap-3" : ""
          }`}
        >
          {inboxListDesktop ? (
            <>
              <p className="hidden min-w-0 flex-1 truncate text-left text-[11px] font-medium text-slate-600 lg:block">
                Signed in · {displayName}
              </p>
              {ui.remoteLabel ? (
                <p className="hidden min-w-0 max-w-[40%] truncate text-[11px] text-slate-500 lg:block">
                  {ui.remoteLabel}
                </p>
              ) : null}
            </>
          ) : null}
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.tone} ${
              inboxListDesktop ? "lg:px-2 lg:py-0.5 lg:text-[10px]" : ""
            }`}
          >
            {inboundRingEnabled ? <CircleDot className="h-3.5 w-3.5" strokeWidth={2} /> : <WifiOff className="h-3.5 w-3.5" strokeWidth={2} />}
            {status.label}
          </span>
          {inboundRingEnabled ? (
            <p
              className={`max-w-[14rem] text-right text-[10px] leading-snug text-slate-400 ${
                inboxCompact ? "lg:hidden" : ""
              }`}
            >
              Browser softphone: keep this app open. Background or locked mobile usually will not ring (no native
              incoming-call push).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
