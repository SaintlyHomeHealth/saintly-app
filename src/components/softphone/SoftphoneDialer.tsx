"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Delete, MessageSquareText, Phone, Sparkles, X } from "lucide-react";

import {
  useWorkspaceSoftphone,
  type OutboundCliSelection,
  type SoftphoneServerCapabilities,
} from "@/components/softphone/WorkspaceSoftphoneProvider";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import { parseWorkspaceOutboundDialInput } from "@/lib/softphone/phone-number";
import { isPlausiblePstnCallerRawForSubline } from "@/lib/softphone/twilio-incoming-caller-display";
import { openSoftphoneAppSettings } from "@/lib/softphone/open-app-settings";
import { isReactNativeWebViewShell } from "@/lib/softphone/native-speaker-bridge";
import { QuickSaveContactSheet } from "@/components/workspace-phone/QuickSaveContactSheet";

/** After initial delete, wait this long before rapid repeat (keypad backspace hold). */
const KEYPAD_BACKSPACE_REPEAT_DELAY_MS = 420;
/** Interval between deletes while backspace is held. */
const KEYPAD_BACKSPACE_REPEAT_EVERY_MS = 68;

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
    sendDtmfDigits,
  } = useWorkspaceSoftphone();
  const autoPlaceAttemptedSeedRef = useRef<string | null>(null);
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
    if (!autoPlaceCall) return;
    if (listenState !== "ready") return;
    if (status !== "idle" || incoming) return;
    const seed = (initialDigits ?? "").trim();
    if (!seed) return;
    if (autoPlaceAttemptedSeedRef.current === seed) return;
    autoPlaceAttemptedSeedRef.current = seed;
    queueMicrotask(() => {
      void startCall(seed);
    });
  }, [autoPlaceCall, initialDigits, listenState, status, incoming, startCall]);

  const [callerPickerOpen, setCallerPickerOpen] = useState(false);
  /** Keypad variant: inline expandable list (no full-screen modal). */
  const [callAsKeypadExpanded, setCallAsKeypadExpanded] = useState(false);
  const [keypadSaveSheetOpen, setKeypadSaveSheetOpen] = useState(false);
  const [keypadSaveE164, setKeypadSaveE164] = useState("");
  const [keypadShowSaveCta, setKeypadShowSaveCta] = useState(false);
  const [keypadSaveResetKey, setKeypadSaveResetKey] = useState(0);
  const outboundLines = softphoneCapabilities?.outbound_lines ?? [];
  const callAs = useMemo(
    () => buildCallAsSummary({ cap: softphoneCapabilities, sel: outboundCliSelection }),
    [softphoneCapabilities, outboundCliSelection]
  );

  const dialInputLocked = (busy && status !== "in_call") || Boolean(incoming);
  const showCallButton = !busy;
  const keypadDisabled = dialInputLocked;

  /** Press-and-hold backspace: one delete on press, then repeat after a short delay until release. */
  const backspaceHoldTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const backspaceRepeatIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const clearBackspaceRepeat = useCallback(() => {
    if (backspaceHoldTimeoutRef.current != null) {
      window.clearTimeout(backspaceHoldTimeoutRef.current);
      backspaceHoldTimeoutRef.current = null;
    }
    if (backspaceRepeatIntervalRef.current != null) {
      window.clearInterval(backspaceRepeatIntervalRef.current);
      backspaceRepeatIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearBackspaceRepeat();
    };
  }, [clearBackspaceRepeat]);

  useEffect(() => {
    const onWinBlur = () => clearBackspaceRepeat();
    window.addEventListener("blur", onWinBlur);
    return () => window.removeEventListener("blur", onWinBlur);
  }, [clearBackspaceRepeat]);

  useEffect(() => {
    if (variant !== "keypad") {
      setKeypadShowSaveCta(false);
      return;
    }
    if ((busy && status !== "in_call") || incoming) {
      setKeypadShowSaveCta(false);
      return;
    }
    const raw = digits.trim();
    if (!raw) {
      setKeypadShowSaveCta(false);
      setKeypadSaveE164("");
      return;
    }
    const handle = window.setTimeout(() => {
      const parsed = parseWorkspaceOutboundDialInput(raw);
      if (!parsed.ok) {
        setKeypadShowSaveCta(false);
        setKeypadSaveE164("");
        return;
      }
      setKeypadSaveE164(parsed.e164);
      void fetch(`/api/workspace/phone/contact-by-phone?phone=${encodeURIComponent(parsed.e164)}`, {
        credentials: "include",
      })
        .then((r) => r.json() as Promise<{ match?: unknown }>)
        .then((j) => {
          setKeypadShowSaveCta(!j?.match);
        })
        .catch(() => {
          setKeypadShowSaveCta(false);
        });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [variant, digits, busy, status, incoming]);

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
          {!isReactNativeWebViewShell() && !ringtoneUnlocked ? (
            <p className="mt-1 max-w-xl text-xs text-amber-800">
              Tap this panel once to unlock incoming ring sound on this device (mobile browsers require a gesture).
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
            {process.env.NODE_ENV === "development" ? (
              <button
                type="button"
                onClick={() => void testRingtone()}
                disabled={Boolean(incoming)}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-dashed border-amber-300/90 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/80 disabled:opacity-50 sm:flex-none"
              >
                Test ringtone (dev)
              </button>
            ) : null}
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
    <div className="flex w-full flex-col">
      <div className="w-full border-b border-slate-100/80 pb-2 lg:pb-1.5">
        <div className="w-full px-0 py-0">
        {outboundLines.length > 0 ? (
          <button
            type="button"
            disabled={!callAs.showSheetTrigger}
            onClick={() => callAs.showSheetTrigger && setCallAsKeypadExpanded((v) => !v)}
            className={`flex w-full items-center gap-2.5 rounded-lg py-1.5 pl-0 pr-0 text-left transition duration-150 hover:bg-sky-50/50 sm:py-2 lg:py-1 ${
              callAs.showSheetTrigger ? "" : "cursor-default"
            }`}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center rounded-lg bg-sky-50/90 ring-1 ring-sky-200/45 sm:h-8 sm:w-8"
              aria-hidden
            >
              <Phone className="m-auto h-[15px] w-[15px] text-blue-800 sm:h-[17px] sm:w-[17px]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:text-[10px] sm:tracking-[0.14em]">
                Call as
              </p>
              <p className="mt-0.5 text-[13px] font-semibold leading-tight text-slate-900 sm:text-[14px]">{callAs.org}</p>
              <p className="mt-0.5 text-[11px] font-semibold tabular-nums leading-tight text-slate-800 sm:text-[12px] sm:font-medium">
                {callAs.numberDisplay}
                {callAs.lineLabel ? (
                  <span className="font-medium text-slate-500">
                    {" "}
                    · <span className="text-[10px] sm:text-[11px]">{callAs.lineLabel}</span>
                  </span>
                ) : null}
              </p>
            </div>
            {callAs.showSheetTrigger ? (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition duration-150 sm:h-[18px] sm:w-[18px] ${callAsKeypadExpanded ? "rotate-180" : ""}`}
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
          </button>
        ) : (
          <div className="flex items-start gap-2 sm:gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center rounded-lg border border-sky-200/70 bg-sky-50/90 ring-1 ring-sky-100/50 sm:h-8 sm:w-8"
              aria-hidden
            >
              <Phone className="m-auto h-[15px] w-[15px] text-blue-800 sm:h-[17px] sm:w-[17px]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Softphone</p>
              <p className="mt-0.5 text-[14px] font-semibold leading-tight text-slate-900 sm:text-[15px]">{staffDisplayName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-1.5">
                <p className="text-[11px] leading-snug text-slate-500">
                  {listenState === "ready"
                    ? "Ready for calls"
                    : listenState === "loading"
                      ? "Connecting…"
                      : "Inbound listen limited; outbound still available"}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
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
        {!isReactNativeWebViewShell() && !ringtoneUnlocked ? (
          <p className="mt-2 border-t border-amber-200/15 pt-1.5 text-[8px] leading-snug text-amber-800/45 sm:text-[9px]">
            Tap the dial pad once so incoming calls can ring on this device.
          </p>
        ) : null}
        </div>
      </div>

      <div
        className="mt-[12px] flex min-h-[56px] w-full items-center border-b border-slate-200/80 bg-transparent px-1 lg:mt-2 lg:min-h-[48px]"
        aria-live="polite"
        aria-label="Number entered"
      >
        <p
          title={digits.trim() ? formatDialpadDisplay(digits) : undefined}
          className={`w-full min-w-0 text-center text-[34px] font-semibold leading-none tracking-tight tabular-nums sm:text-[34px] lg:text-[30px] ${
            digits.trim() ? "truncate font-bold text-slate-950" : "font-medium text-slate-400"
          }`}
        >
          {digits.trim() ? formatDialpadDisplay(digits) : <span className="font-medium text-slate-400">Enter number</span>}
        </p>
      </div>

      {incoming ? (
        <div className="mt-[14px] w-full lg:mt-[10px]">
        <div className="flex w-full flex-col gap-4 rounded-2xl border border-sky-100/70 bg-white px-4 py-4 shadow-sm lg:gap-3 lg:px-3.5 lg:py-3.5">
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
              className="touch-manipulation select-none rounded-full border border-slate-300/90 bg-white py-3.5 text-base font-semibold text-slate-800 shadow-sm transition-[transform] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97]"
            >
              Decline
            </button>
          </div>
        </div>
        </div>
      ) : (
        <>
          <div
            className="mx-auto mt-[14px] grid w-full max-w-[276px] grid-cols-3 gap-3 sm:max-w-[320px] lg:mt-[10px] lg:max-w-[328px] lg:gap-2.5"
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
                    if (status === "in_call") {
                      sendDtmfDigits(digit);
                      return;
                    }
                    setDigits((d) => d + digit);
                  }}
                  className="flex h-[84px] w-full touch-manipulation select-none flex-col items-center justify-center rounded-3xl border border-slate-200/85 bg-white text-slate-900 shadow-[0_1px_3px_-1px_rgba(15,23,42,0.08),0_2px_8px_-3px_rgba(15,23,42,0.05)] transition-[transform,box-shadow,background-color] duration-150 ease-out sm:h-[80px] lg:h-[68px] hover:bg-slate-50 active:scale-[0.97] active:border-sky-200/80 active:bg-sky-50/80 disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="text-[1.6rem] font-bold leading-none tabular-nums tracking-tight sm:text-[1.65rem] lg:text-[1.45rem]">{digit}</span>
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

          <div className="mt-[14px] flex w-full items-center gap-4 px-0 lg:mt-[10px] lg:gap-3">
            <button
              type="button"
              disabled={keypadDisabled || !digits.length}
              className="flex h-14 w-14 shrink-0 touch-manipulation select-none items-center rounded-full border border-slate-200/85 bg-white text-slate-600 shadow-[0_1px_3px_-1px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] active:bg-sky-50/80 disabled:pointer-events-none disabled:opacity-25 lg:h-12 lg:w-12"
              aria-label="Backspace"
              onPointerDown={(e) => {
                if (keypadDisabled || !digits.length) return;
                if (e.button !== 0) return;
                e.preventDefault();
                const remainingAfterDelete = digits.length - 1;
                setDigits((d) => d.slice(0, -1));
                clearBackspaceRepeat();
                if (remainingAfterDelete <= 0) return;
                backspaceHoldTimeoutRef.current = window.setTimeout(() => {
                  backspaceHoldTimeoutRef.current = null;
                  backspaceRepeatIntervalRef.current = window.setInterval(() => {
                    setDigits((d) => {
                      if (!d.length) {
                        clearBackspaceRepeat();
                        return d;
                      }
                      return d.slice(0, -1);
                    });
                  }, KEYPAD_BACKSPACE_REPEAT_EVERY_MS);
                }, KEYPAD_BACKSPACE_REPEAT_DELAY_MS);
              }}
              onPointerUp={clearBackspaceRepeat}
              onPointerCancel={clearBackspaceRepeat}
              onPointerLeave={clearBackspaceRepeat}
            >
              <Delete className="m-auto h-6 w-6" strokeWidth={1.75} />
            </button>
            <div className="flex min-h-0 min-w-0 flex-1">
              {showCallButton ? (
                <button
                  type="button"
                  onClick={() => void startCall()}
                  disabled={!digits.trim() || !canDial}
                  className="group flex h-[72px] w-full touch-manipulation select-none items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition-[transform,box-shadow,filter] duration-150 ease-out enabled:bg-gradient-to-r enabled:from-slate-950 enabled:via-blue-800 enabled:to-sky-500 enabled:text-white enabled:shadow-[0_6px_22px_-4px_rgba(15,23,42,0.55),0_4px_14px_-4px_rgba(2,132,199,0.45)] enabled:ring-1 enabled:ring-white/35 enabled:hover:brightness-[1.05] enabled:active:scale-[0.97] disabled:pointer-events-none disabled:bg-gradient-to-r disabled:from-slate-400/35 disabled:via-slate-300/25 disabled:to-sky-100/90 disabled:text-slate-600 disabled:shadow-sm disabled:ring-slate-300/40 sm:text-lg lg:h-[60px] lg:text-[15px]"
                >
                  <Phone className="h-6 w-6 shrink-0 text-current group-disabled:opacity-90" strokeWidth={2.25} aria-hidden />
                  Call
                </button>
              ) : null}
              {status === "in_call" ? (
                <button
                  type="button"
                  onClick={hangUp}
                  className="flex h-[72px] w-full touch-manipulation select-none items-center justify-center rounded-full border-2 border-red-400/90 bg-white px-6 text-base font-bold text-red-900 shadow-sm transition-[transform,background-color] duration-150 ease-out hover:bg-red-50 active:scale-[0.97] sm:text-lg lg:h-[60px] lg:text-[15px]"
                >
                  Hang up
                </button>
              ) : null}
            </div>
          </div>
          {keypadShowSaveCta && status === "idle" && !incoming ? (
            <div className="mt-3 w-full px-0">
              <button
                type="button"
                onClick={() => {
                  const raw = digits.trim();
                  const parsedSave = parseWorkspaceOutboundDialInput(raw);
                  if (parsedSave.ok) {
                    setKeypadSaveE164(parsedSave.e164);
                  }
                  setKeypadSaveResetKey((k) => k + 1);
                  setKeypadSaveSheetOpen(true);
                }}
                className="w-full touch-manipulation rounded-2xl border border-slate-200/90 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
              >
                Save contact
              </button>
            </div>
          ) : null}
          {status === "in_call" ? (
            <div className="mt-4 w-full max-w-full sm:max-w-[520px] lg:mt-3">
            <div className="flex w-full flex-col gap-3">
              <div className="rounded-2xl border border-sky-100/70 bg-white px-3 py-3 shadow-sm">
                <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  On a call
                </p>
                <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-600">
                  Use the <span className="font-semibold text-slate-800">call bar</span> for mute, hold, transfer, record,
                  and the in-call keypad. Taps on the dial pad below send DTMF to the live call (they do not change the
                  number field). Open Transcript when you are ready to enable live captions.
                </p>
                <button
                  type="button"
                  onClick={() => setTranscriptPanelOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white py-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
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
                          const parsedXfer = parseWorkspaceOutboundDialInput(raw);
                          if (!parsedXfer.ok) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a valid US number (10 digits or +1…)." });
                            return;
                          }
                          setActionBusy("xfer");
                          try {
                            const r = await coldTransferTo(parsedXfer.e164);
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
                          const parsedAdd = parseWorkspaceOutboundDialInput(raw);
                          if (!parsedAdd.ok) {
                            setSoftphoneNotice({ kind: "error", message: "Enter a valid number to add." });
                            return;
                          }
                          setActionBusy("add");
                          try {
                            const r = await addConferenceParticipant(parsedAdd.e164);
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
            </div>
          ) : null}
        </>
      )}
    </div>
  );
  return (
    <section
      className={
        variant === "keypad"
          ? "flex w-full flex-col"
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
              ? "mt-1.5 text-center text-[11px] font-medium text-slate-700"
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
              ? "mt-2 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-left shadow-sm"
              : "mt-2 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-left"
          }
          role="alert"
        >
          <p className={variant === "keypad" ? "text-xs font-medium text-amber-950 sm:text-sm" : "text-xs font-medium text-amber-950"}>
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
      {variant === "keypad" ? (
        <QuickSaveContactSheet
          open={keypadSaveSheetOpen}
          onOpenChange={setKeypadSaveSheetOpen}
          initialE164={keypadSaveE164}
          resetKey={keypadSaveResetKey}
        />
      ) : null}
    </section>
  );
}
