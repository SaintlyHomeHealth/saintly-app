"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  WORKSPACE_SOFTPHONE_UI_EVENT,
  type WorkspaceSoftphoneUiDetail,
} from "@/lib/softphone/workspace-ui-events";

/**
 * Mini call-status strip above the bottom nav. Subscribes to workspace softphone UI events so inbound /
 * active / AI phases stay visible while navigating under `/workspace/*`.
 */
export function WorkspacePhoneCallDock() {
  const pathname = usePathname() ?? "";
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

  const onKeypadOrCalls =
    pathname.startsWith("/workspace/phone/keypad") || pathname.startsWith("/workspace/phone/calls");

  const showAiAssistOnKeypad = ui.phase === "inbound_ai_assist";
  /** ActiveCallBar already shows in-call state; avoid stacking two fixed bars above the nav. */
  if (ui.phase === "active") {
    return null;
  }
  if (ui.phase === "idle" || (onKeypadOrCalls && !showAiAssistOnKeypad)) {
    return null;
  }

  const label =
    ui.phase === "incoming"
      ? "Incoming call"
      : ui.phase === "inbound_ai_assist"
        ? "Inbound — AI on the line"
        : ui.phase === "active"
          ? "On a call"
          : "Connecting…";

  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-[42] border-t border-sky-400/35 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 px-4 py-2.5 text-sky-50 shadow-[0_-8px_32px_-8px_rgba(30,58,138,0.35)] backdrop-blur-sm supports-[backdrop-filter]:bg-blue-950/92"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90">{label}</p>
          {ui.remoteLabel ? (
            <p className="truncate font-mono text-sm text-white">{ui.remoteLabel}</p>
          ) : (
            <p className="text-sm text-sky-100/90">Use Keypad to answer or control the call.</p>
          )}
        </div>
        <Link
          href="/workspace/phone/keypad"
          className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-bold text-phone-ink shadow-sm transition hover:bg-phone-ice"
        >
          Open keypad
        </Link>
      </div>
    </div>
  );
}
