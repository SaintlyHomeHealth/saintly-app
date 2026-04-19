"use client";

import { Info, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

type SmsOutboundInfo = {
  credentialsComplete: boolean;
  missingEnvVars: string[];
  outboundMode: "messaging_service" | "from_e164" | "from_raw" | "missing";
  outboundSenderMasked: string;
  selectable: boolean;
};

function modeHint(mode: SmsOutboundInfo["outboundMode"]): string {
  switch (mode) {
    case "messaging_service":
      return "Twilio may choose the sending number from your messaging service.";
    case "from_e164":
      return "Outbound texts use this caller ID from server configuration.";
    case "from_raw":
      return "Outbound sender is configured on the server.";
    default:
      return "SMS outbound is not fully configured (check Twilio env on the server).";
  }
}

/**
 * Read-only “text from” line for compose/reply — matches actual `sendSms` / TWILIO_SMS_FROM behavior.
 * When `selectable` becomes true server-side, replace with a real picker wired to send actions.
 */
export function SmsTextFromBar({ className = "" }: { className?: string }) {
  const [info, setInfo] = useState<SmsOutboundInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/workspace/phone/sms-outbound-info", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          if (!cancelled) setErr("Could not load SMS sender info.");
          return;
        }
        const j = (await r.json()) as SmsOutboundInfo;
        if (!cancelled) setInfo(j);
      })
      .catch(() => {
        if (!cancelled) setErr("Could not load SMS sender info.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    info?.outboundMode === "messaging_service"
      ? "Messaging service"
      : info?.outboundMode === "missing" || !info?.credentialsComplete
        ? "SMS not configured"
        : "Text from";

  const value = err ? "—" : (info?.outboundSenderMasked ?? "…");

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-[11px] text-slate-700 ${className}`.trim()}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="text-slate-400"> · </span>
        <span className="font-mono tabular-nums text-slate-600">{value}</span>
      </div>
      <span className="relative inline-flex shrink-0">
        <button
          type="button"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-200/80 hover:text-slate-800"
          aria-label="About SMS sender"
          title={modeHint(info?.outboundMode ?? "missing")}
        >
          <Info className="h-4 w-4" strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}
