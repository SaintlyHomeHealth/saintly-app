"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import {
  buildTranscriptMessages,
  transcriptSpeakerLabel,
  type TranscriptBubble,
} from "@/components/softphone/build-transcript-messages";
import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

function BubbleRow({
  msg,
  callerLabel,
}: {
  msg: TranscriptBubble;
  callerLabel: string;
}) {
  const isSaintly = msg.speaker === "saintly";
  return (
    <div className={`flex w-full ${isSaintly ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[min(100%,20rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_2px_12px_-4px_rgba(0,0,0,0.35)] ${
          isSaintly
            ? "rounded-tl-sm border border-sky-500/25 bg-gradient-to-br from-sky-900/90 to-slate-900/95 text-sky-50"
            : "rounded-tr-sm border border-white/10 bg-slate-800/90 text-slate-100"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-200/80">
          {transcriptSpeakerLabel(msg.speaker, callerLabel)}
        </p>
        <p className="mt-1 whitespace-pre-wrap">{msg.text}</p>
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
    enableTranscriptManual,
    callContextLoadError,
  } = useWorkspaceSoftphone();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const voiceAi = callContext?.voice_ai ?? null;
  const messages = buildTranscriptMessages(voiceAi, activeRemoteLabel ?? "Caller");
  const callerLabel = activeRemoteLabel ?? "Caller";

  useEffect(() => {
    if (!transcriptPanelOpen || !transcriptEnabled) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcriptPanelOpen, transcriptEnabled]);

  if (status !== "in_call" || !transcriptPanelOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[50] flex flex-col bg-slate-950/92 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Live transcript"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-950/40 via-slate-950/80 to-slate-950" />
      <header className="relative flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300/90">Live transcript</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{callerLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setTranscriptPanelOpen(false)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close transcript"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
      >
        {!transcriptEnabled ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-lg font-semibold text-white">Transcription is off</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Turn on live transcription to see the conversation as it happens.
            </p>
            <button
              type="button"
              onClick={() => void enableTranscriptManual()}
              className="mt-8 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 active:scale-[0.98]"
            >
              Enable Transcript
            </button>
          </div>
        ) : callContextLoadError ? (
          <p className="text-center text-sm text-amber-200/90">
            Unable to load transcript right now.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400">Listening… transcript will appear shortly.</p>
        ) : (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-8">
            {messages.map((m) => (
              <BubbleRow key={m.id} msg={m} callerLabel={callerLabel} />
            ))}
            <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}
