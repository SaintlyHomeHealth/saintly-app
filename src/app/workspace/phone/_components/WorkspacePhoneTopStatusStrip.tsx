"use client";

import { CircleDot, Info, WifiOff } from "lucide-react";
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
    ? "flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-sky-100/70 bg-white/90 px-2 py-1 backdrop-blur lg:rounded-md lg:border-slate-200/80 lg:px-2.5 lg:py-1.5 lg:shadow-none"
    : `flex flex-wrap items-center justify-between gap-1.5 border border-sky-100/70 bg-white/90 px-2 py-1 backdrop-blur sm:gap-2 sm:px-3 sm:py-1.5 ${
        inboxCompact
          ? "rounded-lg shadow-none lg:rounded-lg lg:border-slate-200/70 lg:py-2 lg:shadow-none"
          : "rounded-lg shadow-sm shadow-sky-950/5 sm:rounded-xl"
      }`;

  const mobileHint =
    "Browser softphone: keep this tab open. A locked phone usually will not ring (no native incoming-call push).";

  return (
    <div
      className={`mx-auto mt-1 w-full px-3 sm:mt-2 sm:px-5 ${inboxCompact ? "max-w-none lg:mt-1 lg:px-3" : "max-w-6xl"} ${
        inboxListDesktop ? "lg:mt-0 lg:px-3" : ""
      }`}
    >
      <div className={innerCardClass}>
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${inboxListDesktop ? "lg:hidden" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-slate-800 md:hidden">{displayName}</p>
            <p className="hidden truncate text-[11px] font-semibold leading-tight text-slate-700 md:block sm:text-xs">
              <span className="font-normal text-slate-500">Signed in</span> · {displayName}
            </p>
            {ui.remoteLabel ? (
              <p className="hidden truncate text-[10px] text-slate-500 lg:block">{ui.remoteLabel}</p>
            ) : null}
          </div>
        </div>
        <div
          className={`flex min-w-0 flex-1 flex-col items-end gap-0.5 sm:flex-initial sm:gap-1 ${
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
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-[11px] ${status.tone} ${
                inboxListDesktop ? "lg:px-2 lg:py-0.5 lg:text-[10px]" : ""
              }`}
            >
              {inboundRingEnabled ? <CircleDot className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2} /> : <WifiOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2} />}
              {status.label}
            </span>
            {inboundRingEnabled ? (
              <>
                <p className="hidden max-w-[14rem] text-right text-[10px] leading-snug text-slate-400 md:block">
                  {mobileHint}
                </p>
                <details className="relative md:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-center rounded-full border border-slate-200/80 bg-white/80 p-1 text-slate-500 [&::-webkit-details-marker]:hidden">
                    <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    <span className="sr-only">Why mobile may not ring</span>
                  </summary>
                  <p className="absolute right-0 top-full z-20 mt-1 max-w-[14rem] rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 text-[10px] leading-snug text-slate-600 shadow-md">
                    {mobileHint}
                  </p>
                </details>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
