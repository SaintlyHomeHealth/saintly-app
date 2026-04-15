"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, MessageSquareText, Mic, X } from "lucide-react";

import {
  buildSoftphoneAssistantDebugEntries,
  buildTranscriptAiNotes,
  buildTranscriptMessages,
  transcriptSpeakerLabel,
  type TranscriptBubble,
} from "@/components/softphone/build-transcript-messages";
import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

function formatTranscriptTime(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function BubbleRow({
  msg,
  callerLabel,
  softphoneTranscript,
}: {
  msg: TranscriptBubble;
  callerLabel: string;
  softphoneTranscript: boolean;
}) {
  const isSaintly = msg.speaker === "saintly";
  const isUnknown = msg.speaker === "unknown";
  const isYou = msg.speaker === "local";

  const label = transcriptSpeakerLabel(msg.speaker, callerLabel, { softphoneTranscript });
  const time = formatTranscriptTime(msg.ts);

  const align =
    isUnknown ? "justify-center" : isYou ? "justify-end" : "justify-start";

  const bubbleClass = isUnknown
    ? "rounded-2xl border border-white/[0.08] bg-white/[0.06] px-4 py-3 text-slate-200 shadow-sm"
    : isYou
      ? "rounded-2xl rounded-br-md border border-sky-400/25 bg-gradient-to-br from-sky-600/35 via-sky-700/25 to-slate-900/60 px-4 py-3 text-slate-50 shadow-[0_4px_24px_-8px_rgba(56,189,248,0.35)]"
      : isSaintly
        ? "rounded-2xl rounded-tl-md border border-sky-500/20 bg-gradient-to-br from-sky-950/80 to-slate-950/90 px-4 py-3 text-sky-50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)]"
        : "rounded-2xl rounded-tl-md border border-white/[0.1] bg-slate-900/75 px-4 py-3 text-slate-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.45)]";

  const labelClass = isYou
    ? "text-sky-200/95"
    : isSaintly
      ? "text-sky-300/90"
      : "text-slate-300/90";

  return (
    <div className={`flex w-full ${align}`}>
      <div className={`max-w-[min(100%,22rem)] ${bubbleClass}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${labelClass}`}>{label}</p>
          {time ? (
            <time
              dateTime={msg.ts}
              className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500"
            >
              {time}
            </time>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed tracking-[-0.01em]">{msg.text}</p>
      </div>
    </div>
  );
}

function SystemLineRow({ msg, callerLabel, softphoneTranscript }: { msg: TranscriptBubble; callerLabel: string; softphoneTranscript: boolean }) {
  const label = transcriptSpeakerLabel(msg.speaker, callerLabel, { softphoneTranscript });
  const time = formatTranscriptTime(msg.ts);
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[min(100%,22rem)] rounded-2xl rounded-tl-md border border-amber-500/15 bg-amber-950/30 px-4 py-3 text-sm leading-relaxed text-amber-50/95 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200/75">{label}</p>
          {time ? (
            <time dateTime={msg.ts} className="text-[10px] tabular-nums text-amber-200/40">
              {time}
            </time>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap">{msg.text}</p>
      </div>
    </div>
  );
}

export function ActiveCallTranscriptSheet() {
  const {
    status,
    activeRemoteLabel,
    callContext,
    transcriptPanelOpen,
    setTranscriptPanelOpen,
    transcriptEnabled,
    setTranscriptEnabled,
    enableTranscriptManual,
    transcriptStartPending,
    transcriptStartError,
    clearTranscriptStartError,
    stopLiveTranscriptStream,
    callContextLoadError,
  } = useWorkspaceSoftphone();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showSystemLines, setShowSystemLines] = useState(false);
  const [listeningStall, setListeningStall] = useState(false);

  const voiceAi = callContext?.voice_ai ?? null;
  const softphoneHumanTranscript =
    Boolean(callContext?.workspace_softphone_session) ||
    Boolean(voiceAi?.softphone_transcript_streams?.client_stream_started_at) ||
    Boolean(voiceAi?.softphone_transcript_streams?.client_realtime_transcription_started_at) ||
    Boolean(voiceAi?.inbound_transcript_stream_started_at);
  const messages = buildTranscriptMessages(voiceAi, { humanSpeechOnly: softphoneHumanTranscript });
  const assistantDebugEntries = softphoneHumanTranscript ? buildSoftphoneAssistantDebugEntries(voiceAi) : [];
  const aiNotes = buildTranscriptAiNotes(voiceAi);
  const callerLabel = activeRemoteLabel ?? "Caller";
  const headerSubtitle = softphoneHumanTranscript ? "You and your caller" : callerLabel;

  useEffect(() => {
    if (!transcriptPanelOpen || !transcriptEnabled) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcriptPanelOpen, transcriptEnabled]);

  useEffect(() => {
    if (!transcriptEnabled || messages.length > 0 || callContextLoadError || transcriptStartPending) {
      queueMicrotask(() => setListeningStall(false));
      return;
    }
    const t = window.setTimeout(() => setListeningStall(true), 15_000);
    return () => window.clearTimeout(t);
  }, [transcriptEnabled, messages.length, callContextLoadError, transcriptStartPending]);

  if (status !== "in_call" || !transcriptPanelOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[50] flex flex-col bg-[#0a0f1a]/[0.97] backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Live transcript"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.12),transparent_55%)]"
        aria-hidden
      />
      <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
              <MessageSquareText className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400/90">Live transcript</p>
              <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-white">{headerSubtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {transcriptEnabled && softphoneHumanTranscript ? (
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  const r = await stopLiveTranscriptStream();
                  if (r.ok) setTranscriptEnabled(false);
                })()
              }
              className="rounded-full border border-white/15 bg-white/[0.07] px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.11]"
            >
              Stop live transcript
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTranscriptPanelOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
            aria-label="Close transcript"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      >
        {transcriptStartError && !transcriptEnabled ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center px-2 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
              <AlertCircle className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-5 text-lg font-semibold text-red-100">Couldn&apos;t start live transcript</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-red-100/80">
              {transcriptStartError}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              If this continues, contact your administrator with the time of the call. You can try again below.
            </p>
            <button
              type="button"
              onClick={() => {
                clearTranscriptStartError();
                void enableTranscriptManual();
              }}
              className="mt-8 rounded-full bg-white/[0.1] px-8 py-3 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/[0.14]"
            >
              Try again
            </button>
          </div>
        ) : transcriptStartPending && !transcriptEnabled ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center px-2 py-20 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15">
              <Loader2 className="h-7 w-7 animate-spin text-sky-300" aria-hidden />
            </span>
            <p className="mt-6 text-lg font-semibold text-white">Starting live transcript</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Connecting securely. This usually takes a few seconds.
            </p>
          </div>
        ) : !transcriptEnabled ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center px-2 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-300 ring-1 ring-white/10">
              <Mic className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="mt-6 text-lg font-semibold text-white">Live transcript is off</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
              Start when you&apos;re ready to capture this call word-for-word. Nothing is recorded until you begin.
            </p>
            <button
              type="button"
              onClick={() => {
                void enableTranscriptManual();
              }}
              className="mt-10 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-10 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 transition hover:brightness-105 active:scale-[0.98]"
            >
              Start live transcript
            </button>
          </div>
        ) : callContextLoadError ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <AlertCircle className="h-10 w-10 text-amber-400/90" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-sm font-medium text-amber-100/90">Unable to refresh transcript</p>
            <p className="mt-2 text-xs text-slate-500">Check your connection and try closing and reopening this panel.</p>
          </div>
        ) : voiceAi?.inbound_transcript_last_error?.trim() ? (
          <div className="mx-auto max-w-md text-center">
            <p className="text-sm font-semibold text-amber-100/95">Inbound line transcript unavailable</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-amber-100/75">
              {voiceAi.inbound_transcript_last_error.trim()}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Your administrator can review phone integration settings if this persists.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-md text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300/90">
              <Mic className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-5 text-sm font-semibold text-slate-100">
              {listeningStall ? "Still waiting for speech" : "Listening for speech"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {listeningStall
                ? "Lines appear after each person finishes a short phrase. If nothing shows after you’ve both spoken, try stopping and starting live transcript."
                : "Utterances appear here shortly after each person stops talking."}
            </p>
            {softphoneHumanTranscript && assistantDebugEntries.length > 0 ? (
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Only your side and the caller appear here. Optional system-side lines are available below.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-6">
            {messages.map((m) => (
              <BubbleRow
                key={m.id}
                msg={m}
                callerLabel={callerLabel}
                softphoneTranscript={softphoneHumanTranscript}
              />
            ))}
            <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
          </div>
        )}

        {transcriptEnabled && !callContextLoadError && softphoneHumanTranscript && assistantDebugEntries.length > 0 ? (
          <div className="mx-auto mt-2 max-w-xl border-t border-white/[0.06] pt-5">
            <button
              type="button"
              onClick={() => setShowSystemLines((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left text-xs font-medium text-slate-500 transition hover:text-slate-400"
            >
              <span>
                System-side lines{" "}
                <span className="text-slate-600">
                  ({assistantDebugEntries.length})
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-600 transition ${showSystemLines ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {showSystemLines ? (
              <div className="mt-3 flex flex-col gap-4">
                {assistantDebugEntries.map((m) => (
                  <SystemLineRow
                    key={m.id}
                    msg={m}
                    callerLabel={callerLabel}
                    softphoneTranscript={softphoneHumanTranscript}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {transcriptEnabled && !callContextLoadError && aiNotes.length > 0 && !softphoneHumanTranscript ? (
          <div className="mx-auto mt-8 max-w-xl border-t border-white/[0.06] pt-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Call intelligence</p>
            <p className="mt-1 text-xs text-slate-500">From routing and classification — not the live speech log.</p>
            <div className="mt-4 space-y-3">
              {aiNotes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-left shadow-sm"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{n.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{n.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
