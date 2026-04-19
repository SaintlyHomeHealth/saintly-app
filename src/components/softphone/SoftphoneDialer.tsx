"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Delete, MessageSquareText, Phone, Sparkles, X } from "lucide-react";

import {
  useWorkspaceSoftphone,
  type OutboundCliSelection,
  type SoftphoneServerCapabilities,
} from "@/components/softphone/WorkspaceSoftphoneProvider";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { isPlausiblePstnCallerRawForSubline } from "@/lib/softphone/twilio-incoming-caller-display";
import { openSoftphoneAppSettings } from "@/lib/softphone/open-app-settings";

const DIALPAD_ROWS: ReadonlyArray<ReadonlyArray<{ digit: string; sub?: string }>> = [
  [
    { digit: "1", sub: "" },
    { digit: "2", sub: "ABC" },
    { digit: "3", sub: "DEF" },
  ],
  [
    { digit: "4", sub: "GHI" },
    { digit: "5", sub: "JKL" },
    { digit: "6", sub: "MNO" },
  ],
  [
    { digit: "7", sub: "PQRS" },
    { digit: "8", sub: "TUV" },
    { digit: "9", sub: "WXYZ" },
  ],
  [
    { digit: "*", sub: "" },
    { digit: "0", sub: "+" },
    { digit: "#", sub: "" },
  ],
];

/** Large display line for keypad — US-style grouping when input is digits-only (plus optional +). */
function formatDialpadDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/[*#]/.test(t)) {
    return t;
  }
  if (t.startsWith("+")) {
    const rest = t.slice(1).replace(/\D/g, "");
    if (!rest) return "+";
    if (rest.length <= 10) {
      const d = rest;
      if (d.length <= 3) return `+${d}`;
      if (d.length <= 6) return `+${d.slice(0, 3)} ${d.slice(3)}`;
      return `+${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return `+${rest}`;
  }
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}${d.length > 10 ? ` ${d.slice(10)}` : ""}`;
}

function buildCallAsSummary(input: {
  cap: SoftphoneServerCapabilities | null;
  sel: OutboundCliSelection | null;
}): { org: string; lineLabel: string; numberDisplay: string; showSheetTrigger: boolean } {
  const org = input.cap?.org_label?.trim() || "Saintly Home Health";
  const lines = input.cap?.outbound_lines ?? [];
  const block = Boolean(input.cap?.outbound_block_available);
  if (!lines.length) {
    return { org, lineLabel: "", numberDisplay: "—", showSheetTrigger: false };
  }
  const showSheetTrigger = lines.length > 1 || block;
  if (input.sel?.kind === "block") {
    return {
      org,
      lineLabel: "Block caller ID",
      numberDisplay: "Restricted",
      showSheetTrigger: true,
    };
  }
  const e164 =
    input.sel?.kind === "line"
      ? input.sel.e164
      : (lines.find((l) => l.is_default)?.e164 ??
        input.cap?.outbound_default_e164 ??
        lines[0]?.e164 ??
        "");
  const line = lines.find((l) => l.e164 === e164);
  return {
    org,
    lineLabel: line?.label ?? "Line",
    numberDisplay: e164 ? formatPhoneNumber(e164) : "—",
    showSheetTrigger,
  };
}

export type SoftphoneDialerProps = {
  staffDisplayName: string;
  /** Workspace keypad: premium dialpad UI; default keeps the full softphone panel (admin / calls). */
  variant?: "default" | "keypad";
  /** Seed the number field once (e.g. deep link from workspace leads). */
  initialDigits?: string;
  /** After the device is ready, place one outbound call using `initialDigits` (Twilio softphone). */
  autoPlaceCall?: boolean;
};

export function SoftphoneDialer({
  staffDisplayName,
  variant = "default",
  initialDigits,
  autoPlaceCall = false,
}: SoftphoneDialerProps) {
  const {
    digits,
    setDigits,
    listenState,
    status,
    hint,
    hintMeta,
    incomingCallerContactName,
    incomingCallerNumberFormatted,
    incomingCallerRawFrom,
    ringtoneUnlocked,
    busy,
    canDial,
    incoming,
    micMuted,
    isClientHold,
    isPstnHold,
    holdBusy,
    toggleMute,
    toggleHold,
    callContext,
    coldTransferTo,
    addConferenceParticipant,
    startLiveTranscriptStream,
    clearCallError,
    startCall,
    softphoneCapabilities,
    outboundCliSelection,
    setOutboundCliSelection,
    hangUp,
    answerIncoming,
    rejectIncoming,
    testRingtone,
    unlockRingtoneFromGesture,
    setTranscriptPanelOpen,
  } = useWorkspaceSoftphone();
  const autoPlaceStartedRef = useRef(false);
  const [actionBusy, setActionBusy] = useState<"xfer" | "add" | "tx" | null>(null);
  const [xferTo, setXferTo] = useState("");
  const [addTo, setAddTo] = useState("");
  const [softphoneNotice, setSoftphoneNotice] = useState<{ kind: "error" | "info"; message: string } | null>(
    null
  );

  const isOnHold = isPstnHold || isClientHold;
  const gating = callContext?.conference_gating;
  const pstnConferenceReady = Boolean(gating?.can_cold_transfer);
  const mediaStreamOk = Boolean(gating?.media_stream_wss_configured);
  const transcriptWritebackOk = Boolean(gating?.transcript_writeback_configured);
  /** Live transcript can use Twilio native callbacks (preferred) or legacy Railway bridge writeback. */
  const liveStreamButtonEnabled = transcriptWritebackOk;

  useEffect(() => {
    const seed = (initialDigits ?? "").trim();
    if (!seed) return;
    setDigits(seed);
  }, [initialDigits, setDigits]);

  useEffect(() => {
    if (!autoPlaceCall || autoPlaceStartedRef.current) return;
    if (listenState !== "ready") return;
    if (status !== "idle" || incoming) return;
    const seed = (initialDigits ?? "").trim();
    if (!seed) return;
    autoPlaceStartedRef.current = true;
    queueMicrotask(() => {
      void startCall(seed);
    });
  }, [autoPlaceCall, initialDigits, listenState, status, incoming, startCall]);

  const [callerPickerOpen, setCallerPickerOpen] = useState(false);
  /** Keypad variant: inline expandable list (no full-screen modal). */
  const [callAsKeypadExpanded, setCallAsKeypadExpanded] = useState(false);
  const outboundLines = softphoneCapabilities?.outbound_lines ?? [];
  const callAs = useMemo(
    () => buildCallAsSummary({ cap: softphoneCapabilities, sel: outboundCliSelection }),
    [softphoneCapabilities, outboundCliSelection]
  );

  const dialInputLocked = (busy && status !== "in_call") || Boolean(incoming);
  const showCallButton = !busy;
  const keypadDisabled = dialInputLocked;

  const defaultPanel = (
    <>
      {outboundLines.length > 0 ? (
        <div className="mb-3 rounded-xl border border-emerald-200/70 bg-white/95 px-3 py-2.5 shadow-sm">
          <button
            type="button"
            disabled={!callAs.showSheetTrigger}
            onClick={() => callAs.showSheetTrigger && setCallerPickerOpen(true)}
            className={`flex w-full items-start justify-between gap-2 text-left ${
              callAs.showSheetTrigger ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-900/80">Call as</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{callAs.org}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                <span className="font-medium">{callAs.lineLabel}</span>
                {callAs.lineLabel ? <span className="text-slate-400"> · </span> : null}
                <span className="tabular-nums">{callAs.numberDisplay}</span>
              </p>
            </div>
            {callAs.showSheetTrigger ? (
              <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800/70" aria-hidden strokeWidth={2} />
            ) : null}
          </button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Softphone</p>
          <p className="mt-0.5 text-sm text-slate-700">
            Signed in as <span className="font-medium text-slate-900">{staffDisplayName}</span>
          </p>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            {listenState === "ready"
              ? "Listening for inbound calls. Outbound uses the Saintly caller ID and is logged as outbound."
              : listenState === "loading"
                ? "Connecting to phone service…"
                : "Inbound listen unavailable; outbound may still work after you place a call."}
          </p>
          {!ringtoneUnlocked ? (
            <p className="mt-1 max-w-xl text-xs text-amber-800">
              Tap this panel or <span className="font-medium">Test Ringtone</span> once to unlock incoming ring
              sound on this device (mobile browsers require a gesture).
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
          <label className="block text-xs font-semibold text-slate-600" htmlFor="softphone-dial-input">
            Number
          </label>
          <input
            id="softphone-dial-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 or 10-digit"
            value={digits}
            disabled={dialInputLocked}
            onChange={(e) => setDigits(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none ring-emerald-500/30 focus:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void testRingtone()}
              disabled={Boolean(incoming)}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-400/80 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50 sm:flex-none"
            >
              Test Ringtone
            </button>
            {incoming ? (
              <>
                <button
                  type="button"
                  onClick={() => void answerIncoming()}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 sm:flex-none"
                >
                  Answer
                </button>
                <button
                  type="button"
                  onClick={() => void rejectIncoming()}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-none"
                >
                  Decline
                </button>
              </>
            ) : null}
            {showCallButton ? (
              <button
                type="button"
                onClick={() => void startCall()}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50 sm:flex-none"
                disabled={!digits.trim() || !canDial}
              >
                Call
              </button>
            ) : null}
            {status === "in_call" ? (
              <button
                type="button"
                onClick={hangUp}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 shadow-sm transition hover:bg-red-100 sm:flex-none"
              >
                Hang up
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  const keypadPanel = (
    <div className="flex w-full flex-col items-center gap-3.5 sm:gap-5">
      <div className="w-full rounded-xl border border-sky-100/70 bg-gradient-to-br from-white via-white to-sky-50/40 px-3 py-3 shadow-[0_6px_28px_-8px_rgba(30,58,138,0.08),0_2px_8px_-4px_rgba(15,23,42,0.05)] sm:rounded-2xl sm:px-5 sm:py-4">
        {outboundLines.length > 0 ? (
          <button
            type="button"
            disabled={!callAs.showSheetTrigger}
            onClick={() => callAs.showSheetTrigger && setCallAsKeypadExpanded((v) => !v)}
            className={`flex w-full items-center gap-2.5 rounded-lg text-left transition duration-150 hover:bg-sky-50/50 sm:items-start sm:gap-3 sm:rounded-xl ${
              callAs.showSheetTrigger ? "" : "cursor-default"
            }`}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100/95 to-blue-50/90 ring-1 ring-sky-200/60 sm:h-11 sm:w-11 sm:rounded-2xl"
              aria-hidden
            >
              <Phone className="h-4 w-4 text-blue-800 sm:h-5 sm:w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:text-[10px] sm:tracking-[0.14em]">
                Call as
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900 sm:text-[15px]">{callAs.org}</p>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-800 sm:mt-1 sm:text-[13px] sm:font-medium">
                {callAs.numberDisplay}
                {callAs.lineLabel ? (
                  <span className="font-medium text-slate-500">
                    {" "}
                    · <span className="text-[11px]">{callAs.lineLabel}</span>
                  </span>
                ) : null}
              </p>
            </div>
            {callAs.showSheetTrigger ? (
              <ChevronDown
                className={`h-5 w-5 shrink-0 self-center text-slate-400 transition duration-150 sm:mt-1 ${callAsKeypadExpanded ? "rotate-180" : ""}`}
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
          </button>
        ) : (
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100/95 to-blue-50/90 ring-1 ring-sky-200/60"
              aria-hidden
            >
              <Phone className="h-5 w-5 text-blue-800" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Softphone</p>
              <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{staffDisplayName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[11px] leading-snug text-slate-500">
                  {listenState === "ready"
                    ? "Ready for calls"
                    : listenState === "loading"
                      ? "Connecting…"
                      : "Inbound listen limited; outbound still available"}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    listenState === "ready"
                      ? "bg-sky-100 text-sky-950 ring-1 ring-sky-200/60"
                      : listenState === "loading"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {listenState === "ready" ? "Live" : listenState === "loading" ? "…" : "Limited"}
                </span>
              </div>
            </div>
          </div>
        )}
        {callAsKeypadExpanded && outboundLines.length > 0 ? (
          <div className="mt-2 max-h-[min(42vh,280px)] overflow-y-auto overscroll-y-contain border-t border-slate-100 pt-2">
            <p className="px-1 pb-1.5 text-[10px] font-medium text-slate-500">{callAs.org}</p>
            <div className="space-y-0.5">
              {outboundLines.map((line) => {
                const selected =
                  outboundCliSelection?.kind === "block"
                    ? false
                    : outboundCliSelection?.kind === "line"
                      ? outboundCliSelection.e164 === line.e164
                      : line.is_default;
                return (
                  <button
                    key={line.e164}
                    type="button"
                    onClick={() => {
                      setOutboundCliSelection({ kind: "line", e164: line.e164 });
                      setCallAsKeypadExpanded(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition duration-150 hover:bg-sky-50/90 active:bg-sky-100/80 ${
                      selected ? "bg-sky-50 ring-1 ring-sky-200/70" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">{line.label}</span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-slate-600">
                        {formatPhoneNumber(line.e164)}
                      </span>
                    </div>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-sky-700" strokeWidth={2.5} aria-hidden /> : null}
                  </button>
                );
              })}
              {softphoneCapabilities?.outbound_block_available ? (
                <button
                  type="button"
                  onClick={() => {
                    setOutboundCliSelection({ kind: "block" });
                    setCallAsKeypadExpanded(false);
                  }}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition duration-150 hover:bg-slate-50 ${
                    outboundCliSelection?.kind === "block" ? "bg-sky-50 ring-1 ring-sky-200/70" : ""
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900">Block caller ID</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                      Withheld line when configured.
                    </span>
                  </div>
                  {outboundCliSelection?.kind === "block" ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" strokeWidth={2.5} aria-hidden />
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {!ringtoneUnlocked ? (
          <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-snug text-amber-900/90 sm:mt-3 sm:pt-3 sm:text-[11px] sm:leading-relaxed">
            Tap the keypad or <span className="font-semibold">Test ringtone</span> once to hear incoming rings on this
            device.
          </p>
        ) : null}
      </div>

      <div
        className="flex min-h-[4.75rem] w-full max-w-sm items-center justify-center rounded-xl border border-sky-100/80 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_20px_-6px_rgba(30,58,138,0.08)] ring-1 ring-sky-100/40 transition-shadow duration-200 sm:min-h-[5.75rem] sm:rounded-2xl sm:px-5 sm:py-4"
        aria-live="polite"
        aria-label="Number entered"
      >
        <p className="max-w-full break-all text-center text-[1.85rem] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums transition-[color,transform] duration-200 ease-out motion-safe:will-change-transform sm:text-[2.35rem]">
          {digits.trim() ? (
            <span className="inline-block font-semibold">{formatDialpadDisplay(digits)}</span>
          ) : (
            <span className="font-normal text-slate-300/95">Enter number</span>
          )}
        </p>
      </div>
      <p className="px-1 text-center text-[10px] text-slate-500 sm:text-[11px]">10 digits or +1. Tap Call to dial.</p>

      {incoming ? (
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-sky-100/70 bg-gradient-to-b from-white to-sky-50/35 px-4 py-4 shadow-[0_6px_24px_-10px_rgba(30,58,138,0.1)]">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-800">Incoming call</p>
            {incomingCallerContactName ? (
              <p className="mt-1.5 text-lg font-semibold text-slate-900">{incomingCallerContactName}</p>
            ) : null}
            {incomingCallerNumberFormatted ? (
              <p
                className={`font-mono text-lg font-semibold tabular-nums text-slate-900 ${
                  incomingCallerContactName ? "mt-0.5 text-base font-semibold text-slate-800" : "mt-1.5"
                }`}
              >
                {incomingCallerNumberFormatted}
              </p>
            ) : null}
            {isPlausiblePstnCallerRawForSubline(incomingCallerRawFrom) &&
            incomingCallerNumberFormatted &&
            incomingCallerRawFrom !== incomingCallerNumberFormatted &&
            !incomingCallerContactName ? (
              <p className="mt-0.5 font-mono text-xs text-slate-500">{incomingCallerRawFrom}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void answerIncoming()}
              className="touch-manipulation select-none rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 py-3.5 text-base font-bold text-white shadow-[0_8px_24px_-6px_rgba(29,78,216,0.45)] ring-1 ring-white/25 transition-[transform,filter] duration-150 ease-out hover:brightness-[1.03] active:scale-[0.97]"
            >
              Answer
            </button>
            <button
              type="button"
              onClick={() => void rejectIncoming()}
              className="touch-manipulation select-none rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-100/90 py-3.5 text-base font-semibold text-slate-800 shadow-[0_4px_12px_-4px_rgba(15,23,42,0.1)] ring-1 ring-slate-200/40 transition-[transform] duration-150 ease-out hover:to-slate-50 active:scale-[0.97]"
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="grid w-full max-w-[min(100%,20rem)] grid-cols-3 gap-x-3 gap-y-2.5 px-0.5 sm:gap-x-4 sm:gap-y-3"
            role="group"
            aria-label="Dialpad"
          >
            {DIALPAD_ROWS.map((row, ri) =>
              row.map(({ digit, sub }) => (
                <button
                  key={`${ri}-${digit}`}
                  type="button"
                  disabled={keypadDisabled}
                  onClick={() => {
                    void unlockRingtoneFromGesture();
                    setDigits((d) => d + digit);
                  }}
                  className="flex aspect-square max-h-[4rem] w-full min-h-[3.35rem] touch-manipulation select-none flex-col items-center justify-center rounded-full border border-white/90 bg-gradient-to-b from-white to-slate-100/90 text-slate-900 shadow-[0_5px_14px_-3px_rgba(15,23,42,0.12),0_2px_4px_-2px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/50 transition-[transform,box-shadow,background-color] duration-150 ease-out hover:to-slate-50 active:scale-[0.97] active:bg-sky-50/90 active:shadow-[0_3px_12px_-2px_rgba(37,99,235,0.18),inset_0_1px_2px_rgba(30,58,138,0.06)] active:ring-sky-200/70 disabled:pointer-events-none disabled:opacity-40 sm:max-h-[4.35rem] sm:min-h-[3.55rem]"
                >
                  <span className="text-[1.6rem] font-bold leading-none tabular-nums tracking-tight sm:text-[1.75rem]">{digit}</span>
                  {sub ? (
                    <span className="mt-0.5 text-[0.5rem] font-medium uppercase tracking-[0.12em] text-slate-400">
                      {sub}
                    </span>
                  ) : (
                    <span className="mt-0.5 h-[0.5rem]" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>

          {status === "in_call" ? (
            <div className="flex w-full max-w-sm flex-col gap-3">
              <div className="rounded-2xl border border-sky-100/70 bg-gradient-to-b from-sky-50/50 to-white px-3 py-3 shadow-[0_4px_16px_-8px_rgba(30,58,138,0.07)]">
                <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  On a call
                </p>
                <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-600">
                  Use the <span className="font-semibold text-slate-800">call bar</span> for mute, hold, transfer, record,
                  and keypad. Open Transcript when you are ready to enable live captions.
                </p>
                <button
                  type="button"
                  onClick={() => setTranscriptPanelOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200/90 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 py-2.5 text-xs font-semibold text-sky-50 shadow-sm transition hover:brightness-110"
                >
                  <MessageSquareText className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} />
                  Transcript
                </button>
                <button
                  type="button"
                  disabled={actionBusy !== null || !liveStreamButtonEnabled}
                  title={
                    liveStreamButtonEnabled
                      ? "Start Twilio live transcription (persists to this call)"
                      : "Set TWILIO_WEBHOOK_BASE_URL (or TWILIO_PUBLIC_BASE_URL) for transcription callbacks, or REALTIME_BRIDGE_SHARED_SECRET for legacy bridge"
                  }
                  onClick={() => {
                    void (async () => {
                      setSoftphoneNotice(null);
                      if (!liveStreamButtonEnabled) {
                        setSoftphoneNotice({
                          kind: "error",
                          message:
                            "Live transcript is not configured. Set TWILIO_WEBHOOK_BASE_URL or TWILIO_PUBLIC_BASE_URL to your public https:// origin (Twilio transcription callback), or set REALTIME_BRIDGE_SHARED_SECRET if you still use the legacy bridge.",
                        });
                        return;
                      }
                      setActionBusy("tx");
                      try {
                        const r = await startLiveTranscriptStream();
                        if (!r.ok) {
                          setSoftphoneNotice({
                            kind: "error",
                            message: r.error ?? "Could not start live transcription.",
                          });
                          return;
                        }
                        setSoftphoneNotice({
                          kind: "info",
                          message:
                            "Twilio live transcription start requested — lines should appear in the transcript panel as audio is spoken.",
                        });
                      } finally {
                        setActionBusy(null);
                      }
                    })();
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200/80 bg-white py-2.5 text-xs font-semibold text-slate-800 shadow-sm disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} />
                  {actionBusy === "tx" ? "…" : "Start live transcript"}
                </button>
                {softphoneNotice ? (
                  <div
                    className={`mt-2 rounded-xl border px-2.5 py-2 text-[11px] leading-snug ${
                      softphoneNotice.kind === "error"
                        ? "border-red-200/90 bg-red-50/95 text-red-950"
                        : "border-sky-200/90 bg-sky-50/90 text-sky-950"
                    }`}
                  >
                    <span className="font-semibold">{softphoneNotice.kind === "error" ? "Notice — " : ""}</span>
                    {softphoneNotice.message}
                  </div>
                ) : null}
                <details className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                    Advanced (transfer / 3-way from keypad)
                  </summary>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Prefer the call bar on small screens. Fields below mirror the legacy keypad flow.
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={isClientHold || holdBusy}
                      className={`rounded-lg border py-2 text-[11px] font-semibold shadow-sm ${
                        micMuted
                          ? "border-blue-300 bg-blue-50 text-blue-950"
                          : "border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 text-slate-800"
                      } disabled:opacity-40`}
                    >
                      {micMuted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleHold()}
                      disabled={holdBusy}
                      className={`rounded-lg border py-2 text-[11px] font-semibold shadow-sm ${
                        isOnHold
                          ? "border-amber-300 bg-amber-50 text-amber-950"
                          : "border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 text-slate-800"
                      } disabled:opacity-40`}
                    >
                      {holdBusy ? "…" : isOnHold ? "Resume" : "Hold"}
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy !== null || !pstnConferenceReady}
                      onClick={() => {
                        void (async () => {
                          setSoftphoneNotice(null);
                          const raw = xferTo.trim();
                          if (!raw) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a number to transfer." });
                            return;
                          }
                          const e164 = isValidE164(raw) ? raw : normalizeDialInputToE164(raw);
                          if (!e164 || !isValidE164(e164)) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a valid US number (10 digits or +1…)." });
                            return;
                          }
                          setActionBusy("xfer");
                          try {
                            const r = await coldTransferTo(e164);
                            if (!r.ok) {
                              setSoftphoneNotice({
                                kind: "error",
                                message: r.error ?? "Transfer could not be completed. Try again when PSTN is linked.",
                              });
                              return;
                            }
                            setSoftphoneNotice({
                              kind: "info",
                              message:
                                "Transfer started on the PSTN leg. Hang up your softphone when you are ready to leave the caller with the new number.",
                            });
                            setXferTo("");
                          } finally {
                            setActionBusy(null);
                          }
                        })();
                      }}
                      className="rounded-lg border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 py-2 text-[11px] font-semibold text-slate-800 shadow-sm disabled:opacity-40"
                    >
                      {actionBusy === "xfer" ? "…" : "Transfer"}
                    </button>
                  </div>
                  <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Transfer to
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 or 10-digit"
                    value={xferTo}
                    disabled={!pstnConferenceReady}
                    onChange={(e) => setXferTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-sky-500/25 focus:ring-2 disabled:bg-slate-50"
                  />
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={actionBusy !== null || !pstnConferenceReady}
                      onClick={() => {
                        void (async () => {
                          setSoftphoneNotice(null);
                          const raw = addTo.trim();
                          if (!raw) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a number to add." });
                            return;
                          }
                          const e164 = isValidE164(raw) ? raw : normalizeDialInputToE164(raw);
                          if (!e164 || !isValidE164(e164)) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a valid number to add." });
                            return;
                          }
                          setActionBusy("add");
                          try {
                            const r = await addConferenceParticipant(e164);
                            if (!r.ok) {
                              setSoftphoneNotice({
                                kind: "error",
                                message: r.error ?? "Could not add participant. Confirm conference mode and PSTN leg.",
                              });
                              return;
                            }
                            setSoftphoneNotice({ kind: "info", message: "Adding participant — they should ring shortly." });
                            setAddTo("");
                          } finally {
                            setActionBusy(null);
                          }
                        })();
                      }}
                      className="rounded-lg border border-sky-200/80 bg-white py-2 text-[11px] font-semibold text-slate-800 shadow-sm disabled:opacity-40"
                    >
                      {actionBusy === "add" ? "…" : "Add / 3-way"}
                    </button>
                  </div>
                  <label className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Add / 3-way number
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 or 10-digit"
                    value={addTo}
                    disabled={!pstnConferenceReady}
                    onChange={(e) => setAddTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-sky-500/25 focus:ring-2 disabled:bg-slate-50"
                  />
                  {!transcriptWritebackOk ? (
                    <p className="mt-2 text-center text-[10px] leading-snug text-amber-900/90">
                      Live transcript: set <span className="font-mono">TWILIO_WEBHOOK_BASE_URL</span> (public https) for Twilio callbacks, or{" "}
                      <span className="font-mono">REALTIME_BRIDGE_SHARED_SECRET</span> for the legacy media-stream bridge.
                    </p>
                  ) : !mediaStreamOk ? (
                    <p className="mt-2 text-center text-[10px] leading-snug text-slate-500">
                      Legacy bridge media stream (WSS) is optional if you use Twilio native transcription only.
                    </p>
                  ) : null}
                </details>
              </div>
            </div>
          ) : null}

          <div className="flex w-full max-w-sm items-center justify-center gap-3 px-1 sm:gap-4">
            <button
              type="button"
              disabled={keypadDisabled || !digits.length}
              onClick={() => setDigits((d) => d.slice(0, -1))}
              className="flex h-[3.65rem] w-[3.65rem] shrink-0 touch-manipulation select-none items-center justify-center rounded-full border border-white/90 bg-gradient-to-b from-white to-slate-100/90 text-slate-600 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.1)] ring-1 ring-slate-200/45 transition-[transform,box-shadow] duration-150 ease-out hover:to-slate-50 active:scale-[0.97] active:bg-sky-50/80 active:shadow-inner active:ring-sky-200/60 disabled:pointer-events-none disabled:opacity-25"
              aria-label="Backspace"
            >
              <Delete className="h-6 w-6" strokeWidth={1.75} />
            </button>
            <div className="flex min-h-[4.25rem] flex-1 items-center justify-center">
              {showCallButton ? (
                <button
                  type="button"
                  onClick={() => void startCall()}
                  disabled={!digits.trim() || !canDial}
                  className="group flex h-[4.25rem] min-w-[min(100%,15rem)] touch-manipulation select-none items-center justify-center gap-2.5 rounded-full px-8 text-lg font-bold transition-[transform,box-shadow,filter] duration-150 ease-out enabled:bg-gradient-to-r enabled:from-blue-950 enabled:via-blue-700 enabled:to-sky-500 enabled:text-white enabled:shadow-[0_10px_32px_-6px_rgba(29,78,216,0.5),0_4px_12px_-4px_rgba(56,189,248,0.3)] enabled:ring-1 enabled:ring-white/30 enabled:hover:brightness-[1.03] enabled:active:scale-[0.97] disabled:pointer-events-none disabled:bg-gradient-to-r disabled:from-blue-950/45 disabled:via-blue-800/35 disabled:to-sky-100/95 disabled:text-sky-950/60 disabled:shadow-[0_8px_26px_-10px_rgba(30,58,138,0.11),0_2px_12px_-4px_rgba(56,189,248,0.14)] disabled:ring-1 disabled:ring-sky-400/40 sm:h-[4.5rem] sm:min-w-[min(100%,16rem)] sm:px-10"
                >
                  <Phone
                    className="h-6 w-6 shrink-0 text-current group-disabled:opacity-90 sm:h-6 sm:w-6"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  Call
                </button>
              ) : null}
              {status === "in_call" ? (
                <button
                  type="button"
                  onClick={hangUp}
                  className="flex h-[4.25rem] min-w-[min(100%,15rem)] touch-manipulation select-none items-center justify-center rounded-full border-2 border-red-400/90 bg-gradient-to-b from-red-50 to-white px-10 text-lg font-bold text-red-900 shadow-[0_4px_18px_-6px_rgba(239,68,68,0.22)] transition-[transform,background-color] duration-150 ease-out hover:bg-red-50 active:scale-[0.97] sm:h-[4.5rem]"
                >
                  Hang up
                </button>
              ) : null}
            </div>
            <div className="h-[3.65rem] w-[3.65rem] shrink-0" aria-hidden />
          </div>

          <div className="w-full max-w-sm border-t border-sky-100/60 pt-4">
            <button
              type="button"
              onClick={() => void testRingtone()}
              disabled={Boolean(incoming)}
              className="w-full touch-manipulation select-none rounded-2xl border border-sky-100/80 bg-gradient-to-b from-sky-50/80 to-white py-3.5 text-sm font-semibold text-slate-700 shadow-[0_2px_8px_-2px_rgba(30,58,138,0.06)] transition-[transform,background-color,border-color] duration-150 ease-out hover:border-sky-200/80 hover:from-sky-100/70 active:scale-[0.99] disabled:opacity-40"
            >
              Test ringtone
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <section
      className={
        variant === "keypad"
          ? "w-full"
          : "rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-sm"
      }
      aria-label="Internal softphone"
      onPointerDownCapture={() => {
        void unlockRingtoneFromGesture();
      }}
    >
      {variant === "keypad" ? keypadPanel : defaultPanel}
      {incoming && variant === "default" ? (
        <p className="mt-3 text-xs font-semibold text-emerald-950">Incoming call — Answer or Decline.</p>
      ) : null}
      {status !== "idle" && status !== "error" ? (
        <p
          className={
            variant === "keypad"
              ? "mt-4 text-center text-xs font-medium text-slate-800"
              : "mt-3 text-xs font-medium text-emerald-900"
          }
        >
          {status === "fetching_token"
            ? "Preparing secure line…"
            : status === "connecting"
              ? "Connecting…"
              : "In call — use your headset or speakers."}
        </p>
      ) : null}
      {hint ? (
        <div
          className={
            variant === "keypad"
              ? "mt-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-left shadow-sm"
              : "mt-2 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-left"
          }
          role="alert"
        >
          <p className={variant === "keypad" ? "text-sm font-medium text-amber-950" : "text-xs font-medium text-amber-950"}>
            {hint}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hintMeta?.suggestSettings ? (
              <button
                type="button"
                onClick={() => openSoftphoneAppSettings()}
                className="rounded-full bg-blue-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900"
              >
                Open Settings
              </button>
            ) : null}
            {hintMeta?.canRetry ? (
              <button
                type="button"
                onClick={() => {
                  clearCallError();
                  void startCall();
                }}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100/80"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {callerPickerOpen && outboundLines.length > 0 && variant !== "keypad" ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-as-picker-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/25 transition duration-150"
            aria-label="Close caller ID picker"
            onClick={() => setCallerPickerOpen(false)}
          />
          <div className="relative z-10 mb-0 max-h-[min(50vh,420px)] w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-lg sm:mb-0 sm:max-h-[min(70vh,520px)] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 id="call-as-picker-title" className="text-sm font-semibold text-slate-900">
                Call as
              </h2>
              <button
                type="button"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setCallerPickerOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="max-h-[min(45vh,360px)] overflow-y-auto px-2 py-2 sm:max-h-[min(60vh,480px)]">
              <p className="px-2 pb-2 text-xs text-slate-500">{callAs.org}</p>
              {outboundLines.map((line) => {
                const selected =
                  outboundCliSelection?.kind === "block"
                    ? false
                    : outboundCliSelection?.kind === "line"
                      ? outboundCliSelection.e164 === line.e164
                      : line.is_default;
                return (
                  <button
                    key={line.e164}
                    type="button"
                    onClick={() => {
                      setOutboundCliSelection({ kind: "line", e164: line.e164 });
                      setCallerPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100/80 ${
                      selected ? "bg-sky-50/90 ring-1 ring-sky-200/80" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{line.label}</span>
                        {line.is_default ? (
                          <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 font-mono text-sm tabular-nums text-slate-600">
                        {formatPhoneNumber(line.e164)}
                      </p>
                    </div>
                    {selected ? <Check className="h-5 w-5 shrink-0 text-sky-700" strokeWidth={2.5} aria-hidden /> : null}
                  </button>
                );
              })}
              {softphoneCapabilities?.outbound_block_available ? (
                <button
                  type="button"
                  onClick={() => {
                    setOutboundCliSelection({ kind: "block" });
                    setCallerPickerOpen(false);
                  }}
                  className={`mt-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100/80 ${
                    outboundCliSelection?.kind === "block" ? "bg-sky-50/90 ring-1 ring-sky-200/80" : ""
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900">Block caller ID</span>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">
                      Uses your organization&apos;s private / withheld line when configured by administrators.
                    </p>
                  </div>
                  {outboundCliSelection?.kind === "block" ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" strokeWidth={2.5} aria-hidden />
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
