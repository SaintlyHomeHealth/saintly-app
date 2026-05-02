"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  isReactNativeWebViewShell,
  postNativeSpeakerQueryToShell,
  postNativeSpeakerSetToShell,
  subscribeNativeSpeakerStateFromShell,
} from "@/lib/softphone/native-speaker-bridge";
import {
  Bug,
  ChevronDown,
  ChevronUp,
  Circle,
  Grid3x3,
  MessageSquareText,
  Mic,
  MicOff,
  PauseCircle,
  PhoneForwarded,
  PhoneOff,
  PlayCircle,
  User,
  Users,
  Volume2,
} from "lucide-react";

import { useWorkspaceCallDuration, useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

import { LiveCallContextPanel } from "@/components/softphone/LiveCallContextPanel";
import { softphoneDevLog } from "@/lib/softphone/softphone-client-debug";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatRecordingElapsed(startedAtIso: string | null, nowMs: number): string {
  if (!startedAtIso) return "0:00";
  const t = Date.parse(startedAtIso);
  if (Number.isNaN(t)) return "0:00";
  return formatDuration(Math.floor((nowMs - t) / 1000));
}

function splitRemoteLabel(label: string | null): { title: string; subtitle: string } {
  if (!label?.trim()) return { title: "On call", subtitle: "" };
  const parts = label.split(" · ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], subtitle: parts.slice(1).join(" · ") };
  }
  return { title: label.trim(), subtitle: "" };
}

function initialsFromTitle(title: string): string {
  const t = title.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return t.slice(0, 2).toUpperCase();
}

const RECORDING_DISCLOSURE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SOFTPHONE_RECORDING_DISCLOSURE?.trim()
    ? process.env.NEXT_PUBLIC_SOFTPHONE_RECORDING_DISCLOSURE.trim()
    : "";

type ControlBtnProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "danger";
};

function ControlBtn({ label, icon, onClick, disabled, active, variant = "default" }: ControlBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-semibold transition ${
        variant === "danger"
          ? "bg-red-500/15 text-red-100 ring-1 ring-red-400/40"
          : active
            ? "bg-white/15 text-white ring-1 ring-indigo-300/50"
            : "bg-white/5 text-slate-100 ring-1 ring-white/10 hover:bg-white/10"
      } disabled:opacity-35`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-inner shadow-black/20">
        {icon}
      </span>
      {label}
    </button>
  );
}

export function ActiveCallBar() {
  const {
    status,
    activeRemoteLabel,
    hangUp,
    micMuted,
    isClientHold,
    isPstnHold,
    holdBusy,
    toggleMute,
    toggleHold,
    callContext,
    setTranscriptPanelOpen,
    coldTransferTo,
    addConferenceParticipant,
    softphoneRecording,
    recordingBusy,
    recordingActionError,
    toggleCallRecording,
    sendDtmfDigits,
  } = useWorkspaceSoftphone();
  const durationSec = useWorkspaceCallDuration();

  const [ctxOpen, setCtxOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  /** Brief highlight on the in-call keypad modal (DTMF feedback). */
  const [dtmfPressedKey, setDtmfPressedKey] = useState<string | null>(null);
  const [xferTo, setXferTo] = useState("");
  const [addTo, setAddTo] = useState("");
  const [actionBusy, setActionBusy] = useState<"xfer" | "add" | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; message: string } | null>(null);
  const [recTick, setRecTick] = useState(0);
  /** Expo / RN shell: earpiece vs speakerphone (native Twilio audio device). */
  const [nativeSpeakerOn, setNativeSpeakerOn] = useState(false);

  const showCallDebug = process.env.NODE_ENV === "development";

  const { title, subtitle } = splitRemoteLabel(activeRemoteLabel);
  const initials = initialsFromTitle(title);
  const gating = callContext?.conference_gating ?? null;
  const pstnConferenceReady = Boolean(gating?.can_cold_transfer);
  const isOnHold = isPstnHold || isClientHold;
  const recordingOn = softphoneRecording?.status === "in-progress";
  const canUseRecording = Boolean(callContext) && status === "in_call";

  useEffect(() => {
    if (!recordingOn) return;
    const id = window.setInterval(() => setRecTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [recordingOn]);

  useEffect(() => {
    setRecTick((n) => n + 1);
  }, [softphoneRecording?.started_at]);

  useEffect(() => {
    if (status !== "in_call") {
      setNativeSpeakerOn(false);
      return;
    }
    if (!isReactNativeWebViewShell()) return;
    postNativeSpeakerQueryToShell();
  }, [status]);

  useEffect(() => {
    if (!isReactNativeWebViewShell()) return undefined;
    return subscribeNativeSpeakerStateFromShell(setNativeSpeakerOn);
  }, []);

  useEffect(() => {
    if (!keypadOpen) return;
    softphoneDevLog("[softphone] in-call keypad opened");
  }, [keypadOpen]);

  const handleHangUpClick = useCallback(() => {
    hangUp();
  }, [hangUp]);

  const onInCallKeypadDigit = (d: string) => {
    sendDtmfDigits(d);
    setDtmfPressedKey(d);
    window.setTimeout(() => {
      setDtmfPressedKey((cur) => (cur === d ? null : cur));
    }, 140);
  };

  const recordingElapsed = useMemo(() => {
    void recTick;
    return formatRecordingElapsed(softphoneRecording?.started_at ?? null, Date.now());
  }, [recTick, softphoneRecording?.started_at]);

  if (status !== "in_call") return null;

  const runTransfer = async () => {
    setNotice(null);
    const raw = xferTo.trim();
    if (!raw) {
      setNotice({ kind: "error", message: "Enter a number to transfer." });
      return;
    }
    const e164 = isValidE164(raw) ? raw : normalizeDialInputToE164(raw);
    if (!e164 || !isValidE164(e164)) {
      setNotice({ kind: "error", message: "Enter a valid US number (10 digits or +1…)." });
      return;
    }
    setActionBusy("xfer");
    try {
      const r = await coldTransferTo(e164);
      if (!r.ok) {
        setNotice({ kind: "error", message: r.error ?? "Transfer could not be completed." });
        return;
      }
      setNotice({
        kind: "info",
        message: "Transfer started on the PSTN leg. Hang up when you are ready to leave the caller with the new number.",
      });
      setXferTo("");
      setXferOpen(false);
    } finally {
      setActionBusy(null);
    }
  };

  const runAdd = async () => {
    setNotice(null);
    const raw = addTo.trim();
    if (!raw) {
      setNotice({ kind: "error", message: "Enter a number to add." });
      return;
    }
    const e164 = isValidE164(raw) ? raw : normalizeDialInputToE164(raw);
    if (!e164 || !isValidE164(e164)) {
      setNotice({ kind: "error", message: "Enter a valid number to add." });
      return;
    }
    setActionBusy("add");
    try {
      const r = await addConferenceParticipant(e164);
      if (!r.ok) {
        setNotice({ kind: "error", message: r.error ?? "Could not add participant." });
        return;
      }
      setNotice({ kind: "info", message: "Adding participant — they should ring shortly." });
      setAddTo("");
      setAddOpen(false);
    } finally {
      setActionBusy(null);
    }
  };

  const DTMF_ROWS: ReadonlyArray<ReadonlyArray<{ d: string; sub?: string }>> = [
    [{ d: "1" }, { d: "2", sub: "ABC" }, { d: "3", sub: "DEF" }],
    [{ d: "4", sub: "GHI" }, { d: "5", sub: "JKL" }, { d: "6", sub: "MNO" }],
    [{ d: "7", sub: "PQRS" }, { d: "8", sub: "TUV" }, { d: "9", sub: "WXYZ" }],
    [{ d: "*" }, { d: "0", sub: "+" }, { d: "#" }],
  ];

  const callShell = (
    <div className="relative overflow-hidden rounded-[1.35rem] shadow-[0_12px_48px_-12px_rgba(30,27,75,0.65)] ring-1 ring-white/10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.35),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(59,130,246,0.2),transparent_50%),radial-gradient(ellipse_at_20%_90%,rgba(139,92,246,0.18),transparent_45%)]"
        aria-hidden
      />
      <div className="relative bg-gradient-to-b from-slate-950/95 via-indigo-950/90 to-slate-950/98 px-4 pb-4 pt-5 sm:px-5 sm:pb-3 sm:pt-3.5">
        {RECORDING_DISCLOSURE ? (
          <p className="mb-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-center text-[11px] leading-snug text-amber-50/95 sm:mb-2">
            {RECORDING_DISCLOSURE}
          </p>
        ) : null}

        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex flex-col items-center sm:flex-row sm:gap-3">
            <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400/90 via-violet-500/85 to-blue-600/90 text-2xl font-bold text-white shadow-[0_8px_32px_-8px_rgba(79,70,229,0.55)] ring-2 ring-white/15 sm:h-12 sm:w-12 sm:text-lg">
              {initials}
            </div>
            <div className="mt-3 min-w-0 sm:mt-0">
              <p className="truncate text-lg font-semibold tracking-tight text-white sm:text-sm">{title}</p>
              {subtitle ? (
                <p className="mt-0.5 font-mono text-sm text-indigo-100/85 tabular-nums sm:text-xs">{subtitle}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <p className="text-[11px] font-medium tabular-nums text-indigo-200/90 sm:text-[10px]">
                  {isPstnHold ? "PSTN hold · " : isClientHold ? "Local hold · " : null}
                  {formatDuration(durationSec)}
                </p>
                {recordingOn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-100 ring-1 ring-red-400/40">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    Recording {recordingElapsed}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 hidden shrink-0 items-center gap-2 sm:mt-0 sm:flex">
            <button
              type="button"
              onClick={toggleMute}
              disabled={isClientHold || holdBusy}
              title={isClientHold ? "Unhold to change mute" : micMuted ? "Unmute" : "Mute"}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 ${
                micMuted ? "bg-white/15 text-white" : "text-indigo-50"
              } disabled:opacity-40`}
            >
              {micMuted ? <MicOff className="h-4 w-4" strokeWidth={2} /> : <Mic className="h-4 w-4" strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={() => void toggleHold()}
              disabled={holdBusy}
              title={isPstnHold || isClientHold ? "Resume" : "Hold"}
              className={`inline-flex h-10 items-center justify-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold ${
                isPstnHold || isClientHold ? "bg-amber-500/25 text-amber-50" : "text-indigo-50"
              } disabled:opacity-40`}
            >
              {holdBusy ? (
                <>
                  <PauseCircle className="h-4 w-4" strokeWidth={2} />…
                </>
              ) : isPstnHold || isClientHold ? (
                <>
                  <PlayCircle className="h-4 w-4" strokeWidth={2} />
                  Resume
                </>
              ) : (
                <>
                  <PauseCircle className="h-4 w-4" strokeWidth={2} />
                  Hold
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void toggleCallRecording()}
              disabled={!canUseRecording || recordingBusy || isClientHold}
              title={!canUseRecording ? "Waiting for call log…" : recordingOn ? "Stop recording" : "Record"}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                recordingOn
                  ? "border-red-400/50 bg-red-500/25 text-red-50"
                  : "border-white/15 text-indigo-50"
              } disabled:opacity-40`}
            >
              <Circle className={`h-3.5 w-3.5 ${recordingOn ? "fill-red-400 text-red-400" : "text-indigo-200"}`} />
              {recordingBusy ? "…" : recordingOn ? "Stop" : "Rec"}
            </button>
            <button
              type="button"
              onClick={() => setTranscriptPanelOpen(true)}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold text-indigo-50"
            >
              <MessageSquareText className="h-4 w-4" strokeWidth={2} />
              Transcript
            </button>
            <button
              type="button"
              onClick={() => setKeypadOpen(true)}
              title="Send DTMF tones"
              className="inline-flex h-10 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold text-indigo-50"
            >
              <Grid3x3 className="h-4 w-4" strokeWidth={2} />
              Keypad
            </button>
            <button
              type="button"
              onClick={() => setCtxOpen((o) => !o)}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold text-indigo-50"
            >
              Context
              {ctxOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showCallDebug ? (
              <button
                type="button"
                onClick={() => setDebugOpen((o) => !o)}
                className="inline-flex h-10 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-200/80"
              >
                <Bug className="h-3.5 w-3.5" />
                Debug
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleHangUpClick}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-red-500 px-4 text-sm font-semibold text-white shadow-lg shadow-red-900/30 hover:bg-red-600"
            >
              <PhoneOff className="h-4 w-4" strokeWidth={2} />
              End
            </button>
          </div>
        </div>

        {recordingActionError ? (
          <p className="mt-2 text-center text-[11px] text-red-200/95 sm:mt-1.5">{recordingActionError}</p>
        ) : null}

        {/* Mobile controls (RN shell: Speaker uses Twilio native AudioDevice → platform earpiece/speaker routing) */}
        <div
          className={`mt-5 grid gap-2 sm:hidden ${isReactNativeWebViewShell() ? "grid-cols-4" : "grid-cols-3"}`}
        >
          <ControlBtn
            label="Transfer"
            icon={<PhoneForwarded className="h-5 w-5" strokeWidth={2} />}
            onClick={() => setXferOpen(true)}
            disabled={!pstnConferenceReady || actionBusy !== null}
          />
          <ControlBtn
            label={holdBusy ? "…" : isOnHold ? "Resume" : "Hold"}
            icon={
              holdBusy ? (
                <PauseCircle className="h-5 w-5 animate-pulse" />
              ) : isOnHold ? (
                <PlayCircle className="h-5 w-5" />
              ) : (
                <PauseCircle className="h-5 w-5" />
              )
            }
            onClick={() => void toggleHold()}
            disabled={holdBusy}
            active={isOnHold}
          />
          <ControlBtn
            label={micMuted ? "Unmute" : "Mute"}
            icon={micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            onClick={toggleMute}
            disabled={isClientHold || holdBusy}
            active={micMuted}
          />
          {isReactNativeWebViewShell() ? (
            <ControlBtn
              label="Speaker"
              icon={<Volume2 className="h-5 w-5" strokeWidth={2} />}
              onClick={() => postNativeSpeakerSetToShell(!nativeSpeakerOn)}
              active={nativeSpeakerOn}
            />
          ) : null}
          <ControlBtn
            label="Add"
            icon={<Users className="h-5 w-5" strokeWidth={2} />}
            onClick={() => setAddOpen(true)}
            disabled={!pstnConferenceReady || actionBusy !== null}
          />
          <ControlBtn
            label={recordingBusy ? "…" : recordingOn ? "Stop rec" : "Record"}
            icon={<Circle className={`h-5 w-5 ${recordingOn ? "fill-red-400 text-red-400" : ""}`} />}
            onClick={() => void toggleCallRecording()}
            disabled={!canUseRecording || recordingBusy || isClientHold}
            active={recordingOn}
          />
          <ControlBtn
            label="Keypad"
            icon={<Grid3x3 className="h-5 w-5" strokeWidth={2} />}
            onClick={() => setKeypadOpen(true)}
          />
        </div>

        <div className="mt-4 flex sm:hidden">
          <button
            type="button"
            onClick={handleHangUpClick}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-base font-bold text-white shadow-lg shadow-red-900/35 active:scale-[0.99]"
          >
            <PhoneOff className="h-5 w-5" strokeWidth={2} />
            End call
          </button>
        </div>

        {/* Mobile bottom tabs */}
        <div className="mt-4 flex rounded-2xl border border-white/10 bg-black/25 p-1 sm:hidden">
          <button
            type="button"
            onClick={() => setCtxOpen(false)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold ${
              !ctxOpen ? "bg-white/15 text-white" : "text-indigo-200/80"
            }`}
          >
            <Volume2 className="h-4 w-4" />
            Audio
          </button>
          <button
            type="button"
            onClick={() => setTranscriptPanelOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-indigo-200/80"
          >
            <MessageSquareText className="h-4 w-4" />
            Transcript
          </button>
          <button
            type="button"
            onClick={() => setCtxOpen(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold ${
              ctxOpen ? "bg-white/15 text-white" : "text-indigo-200/80"
            }`}
          >
            <User className="h-4 w-4" />
            Context
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: full-screen in-call */}
      <div className="fixed inset-0 z-[48] flex flex-col bg-slate-950/97 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] md:hidden">
        {callShell}
        {ctxOpen ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/50 p-2">
            <LiveCallContextPanel
              key={callContext?.conference_gating?.client_leg_call_sid ?? "call-context"}
              voiceAi={callContext?.voice_ai ?? null}
              conference={callContext?.conference ?? null}
              remoteLabel={activeRemoteLabel}
              conferenceGating={callContext?.conference_gating ?? null}
              debugExpanded={debugOpen}
              onToggleDebug={() => setDebugOpen((o) => !o)}
            />
          </div>
        ) : null}
      </div>

      {/* Desktop: bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[43] hidden px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2 sm:px-5 md:block">
        <div className="mx-auto w-full max-w-6xl space-y-2">
          {callShell}
          {ctxOpen ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-2 shadow-xl shadow-slate-950/40 backdrop-blur-md">
              <LiveCallContextPanel
                key={callContext?.conference_gating?.client_leg_call_sid ?? "call-context-d"}
                voiceAi={callContext?.voice_ai ?? null}
                conference={callContext?.conference ?? null}
                remoteLabel={activeRemoteLabel}
                conferenceGating={callContext?.conference_gating ?? null}
                debugExpanded={debugOpen}
                onToggleDebug={() => setDebugOpen((o) => !o)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {xferOpen ? (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-4 shadow-2xl">
            <p className="text-sm font-semibold text-white">Transfer</p>
            <p className="mt-1 text-xs text-slate-400">Cold transfer moves the PSTN party to another number.</p>
            <input
              type="tel"
              inputMode="tel"
              value={xferTo}
              disabled={!pstnConferenceReady}
              onChange={(e) => setXferTo(e.target.value)}
              placeholder="+1 or 10-digit"
              className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-indigo-500/30 focus:ring-2"
            />
            {notice && xferOpen ? (
              <p className={`mt-2 text-xs ${notice.kind === "error" ? "text-red-300" : "text-emerald-200"}`}>
                {notice.message}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setXferOpen(false)}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === "xfer" || !pstnConferenceReady}
                onClick={() => void runTransfer()}
                className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {actionBusy === "xfer" ? "…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-4 shadow-2xl">
            <p className="text-sm font-semibold text-white">Add to call</p>
            <p className="mt-1 text-xs text-slate-400">Dial a third party into the conference.</p>
            <input
              type="tel"
              inputMode="tel"
              value={addTo}
              disabled={!pstnConferenceReady}
              onChange={(e) => setAddTo(e.target.value)}
              placeholder="+1 or 10-digit"
              className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-indigo-500/30 focus:ring-2"
            />
            {notice && addOpen ? (
              <p className={`mt-2 text-xs ${notice.kind === "error" ? "text-red-300" : "text-emerald-200"}`}>
                {notice.message}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy === "add" || !pstnConferenceReady}
                onClick={() => void runAdd()}
                className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {actionBusy === "add" ? "…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {keypadOpen ? (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Keypad</p>
              <button
                type="button"
                onClick={() => setKeypadOpen(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-200"
              >
                Done
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {DTMF_ROWS.map((row, ri) =>
                row.map(({ d, sub }) => (
                  <button
                    key={`${ri}-${d}`}
                    type="button"
                    onClick={() => onInCallKeypadDigit(d)}
                    className={`flex aspect-square flex-col items-center justify-center rounded-2xl border text-lg font-bold text-white transition-[transform,box-shadow,background-color] duration-100 active:scale-95 ${
                      dtmfPressedKey === d
                        ? "border-indigo-400/50 bg-indigo-600/35 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]"
                        : "border-white/10 bg-slate-950/80"
                    }`}
                  >
                    <span>{d}</span>
                    {sub ? <span className="text-[9px] font-medium uppercase text-slate-500">{sub}</span> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
