"use client";

import { Check, ChevronDown, MessageSquare } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useOptionalWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneContext";
import { selectDefaultOutboundSmsLine } from "@/lib/phone/select-default-outbound-sms-line";
import { parseOutboundLinesFromCapabilitiesPayload } from "@/lib/phone/softphone-outbound-lines";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import {
  isSaintlyBackupSmsE164,
  isSaintlyPrimarySmsE164,
  SAINTLY_BACKUP_SMS_E164,
  SAINTLY_PRIMARY_SMS_E164,
} from "@/lib/twilio/sms-from-numbers";

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
      return "Outbound texts use your organization's messaging configuration.";
    case "from_e164":
      return "The default sending number is set by your administrator. When multiple lines appear, your pick is used for outbound SMS.";
    case "from_raw":
      return "Outbound sender is set by your administrator.";
    default:
      return "SMS may not be fully configured. Contact support if messages fail to send.";
  }
}

export type SmsTextFromBarProps = {
  className?: string;
  /** Resets local line pick when switching threads. */
  lockScopeKey?: string;
  /** Persisted thread lock (`conversations.preferred_from_e164`). */
  preferredFromE164?: string | null;
  /** When true, a backup long code in `preferredFromE164` was chosen explicitly in Text-from. */
  preferredFromExplicit?: boolean;
  /** Legacy prop; inbound “To” no longer seeds the default sender (primary is default). */
  inboundToE164?: string | null;
};

/**
 * “Text from” row — mirrors Call-as interaction (expand / pick line).
 * Selected E.164 is submitted as `smsManualFromE164` for manual workspace SMS sends.
 * Seed: honor `preferredFromE164` unless it is the backup line without `preferredFromExplicit`;
 * otherwise default to the org primary long code (not “first available” line order).
 */
export const SmsTextFromBar = memo(function SmsTextFromBar({
  className = "",
  lockScopeKey,
  preferredFromE164,
  preferredFromExplicit,
}: SmsTextFromBarProps) {
  const softphoneCtx = useOptionalWorkspaceSoftphone();
  const ctxLines = useMemo(
    () => softphoneCtx?.softphoneCapabilities?.outbound_lines ?? [],
    [softphoneCtx]
  );
  const [fetchedLines, setFetchedLines] = useState<
    { e164: string; label: string; is_default: boolean }[]
  >([]);

  const effectiveLines = ctxLines.length > 0 ? ctxLines : fetchedLines;

  const [smsInfo, setSmsInfo] = useState<SmsOutboundInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<{ scope: string | null; e164: string } | null>(null);
  const ctxLinesLenRef = useRef(0);
  useLayoutEffect(() => {
    ctxLinesLenRef.current = ctxLines.length;
  }, [ctxLines.length]);

  useEffect(() => {
    if (ctxLines.length > 0) return;
    let cancelled = false;
    void fetch("/api/workspace/phone/softphone-capabilities", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as Record<string, unknown>;
        const parsed = parseOutboundLinesFromCapabilitiesPayload(j);
        if (!cancelled && ctxLinesLenRef.current === 0 && parsed?.length) setFetchedLines(parsed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctxLines.length]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/workspace/phone/sms-outbound-info", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          if (!cancelled) setErr("Could not load SMS sender info.");
          return;
        }
        const j = (await r.json()) as SmsOutboundInfo;
        if (!cancelled) setSmsInfo(j);
      })
      .catch(() => {
        if (!cancelled) setErr("Could not load SMS sender info.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const seedE164 = useMemo(
    () =>
      selectDefaultOutboundSmsLine({
        lines: effectiveLines,
        configuredPrimaryE164: SAINTLY_PRIMARY_SMS_E164,
        preferredFromE164,
        preferredFromExplicit,
      }),
    [effectiveLines, preferredFromE164, preferredFromExplicit]
  );

  const activeE164 = picked?.scope === (lockScopeKey ?? null) ? picked.e164 : seedE164;

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const label =
    smsInfo?.outboundMode === "messaging_service"
      ? "Messaging service"
      : smsInfo?.outboundMode === "missing" || !smsInfo?.credentialsComplete
        ? "SMS not configured"
        : "Text from";

  const maskedFallback = err ? "—" : (smsInfo?.outboundSenderMasked ?? "…");

  const displayLine = useMemo(() => {
    if (!activeE164) return maskedFallback;
    const digits = activeE164.replace(/\D/g, "");
    const line = effectiveLines.find((l) => l.e164.replace(/\D/g, "") === digits);
    if (line) return `${line.label} · ${formatPhoneNumber(activeE164)}`;
    if (isSaintlyPrimarySmsE164(activeE164)) return `Main · ${formatPhoneNumber(SAINTLY_PRIMARY_SMS_E164)}`;
    if (isSaintlyBackupSmsE164(activeE164)) return `Alternate · ${formatPhoneNumber(SAINTLY_BACKUP_SMS_E164)}`;
    return formatPhoneNumber(activeE164);
  }, [effectiveLines, activeE164, maskedFallback]);

  return (
    <div className={`flex w-full min-w-0 flex-col gap-0.5 text-[11px] text-slate-700 ${className}`.trim()}>
      <input type="hidden" name="smsManualFromE164" value={activeE164 ?? ""} aria-hidden />
      <button
        type="button"
        onClick={toggle}
        className="inline-flex w-full max-w-full items-center gap-1.5 rounded-full border border-slate-200/45 bg-white/90 px-2.5 py-1 text-left transition duration-150 hover:bg-slate-50/90"
      >
        <MessageSquare className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1 truncate tabular-nums">
          <span className="font-medium text-slate-700">{label}</span>
          <span className="text-slate-300"> · </span>
          <span className="text-slate-600">{displayLine}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition duration-150 ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="mt-0.5 rounded-lg border border-slate-200/40 bg-white px-2 pb-2 pt-1.5 shadow-sm">
          {effectiveLines.length > 0 ? (
            <div className="max-h-[min(36vh,240px)] space-y-0.5 overflow-y-auto overscroll-y-contain">
              {effectiveLines.map((line) => {
                const selected =
                  activeE164.replace(/\D/g, "") === line.e164.replace(/\D/g, "");
                return (
                  <button
                    key={line.e164}
                    type="button"
                    onClick={() => {
                      setPicked({ scope: lockScopeKey ?? null, e164: line.e164 });
                      setExpanded(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition duration-150 hover:bg-white ${
                      selected ? "bg-white ring-1 ring-sky-200/70" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-900">{line.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-600">{formatPhoneNumber(line.e164)}</span>
                    </span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-sky-700" strokeWidth={2.5} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{modeHint(smsInfo?.outboundMode ?? "missing")}</p>
        </div>
      ) : null}
    </div>
  );
});
