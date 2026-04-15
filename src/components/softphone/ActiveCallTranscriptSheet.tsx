"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Copy,
  Loader2,
  MessageSquareText,
  Mic,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";

import {
  buildSoftphoneAssistantDebugEntries,
  buildTranscriptAiNotes,
  buildTranscriptMessages,
  transcriptSpeakerLabel,
  type TranscriptBubble,
} from "@/components/softphone/build-transcript-messages";
import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { buildTranscriptPlainTextForOperations } from "@/lib/phone/post-call-transcript-text";

type OutputKind = "soap" | "summary" | "intake";

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

  const align = isUnknown ? "justify-center" : isYou ? "justify-end" : "justify-start";

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

function SystemLineRow({
  msg,
  callerLabel,
  softphoneTranscript,
}: {
  msg: TranscriptBubble;
  callerLabel: string;
  softphoneTranscript: boolean;
}) {
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

const OUTPUT_TITLES: Record<OutputKind, string> = {
  soap: "SOAP note",
  summary: "Call summary",
  intake: "Intake summary",
};

export function ActiveCallTranscriptSheet() {
  const {
    status,
    activeRemoteLabel,
    callContext,
    transcriptPanelOpen,
    postCallTranscriptSnapshot,
    dismissTranscriptPanel,
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
  const [outputPanel, setOutputPanel] = useState<{
    kind: OutputKind;
    loading: boolean;
    text: string;
    error: string | null;
    /** From generate API; fallback to call desk `phone_call_id`. */
    phoneCallId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<null | { type: "ok" | "err"; message: string }>(null);

  const isPostCall = status !== "in_call" && postCallTranscriptSnapshot !== null;
  const effectiveDesk = isPostCall ? postCallTranscriptSnapshot?.desk ?? null : callContext;
  const callerLabel =
    (isPostCall ? postCallTranscriptSnapshot?.remoteLabel : activeRemoteLabel) ?? "Caller";

  const voiceAi = effectiveDesk?.voice_ai ?? null;
  const softphoneHumanTranscript =
    Boolean(effectiveDesk?.workspace_softphone_session) ||
    Boolean(voiceAi?.softphone_transcript_streams?.client_stream_started_at) ||
    Boolean(voiceAi?.softphone_transcript_streams?.client_realtime_transcription_started_at) ||
    Boolean(voiceAi?.inbound_transcript_stream_started_at);
  /** During live softphone calls, hide non-human lines in the main thread; post-call review shows full entries for AI tools. */
  const messages = buildTranscriptMessages(voiceAi, {
    humanSpeechOnly: softphoneHumanTranscript && !isPostCall,
  });
  const assistantDebugEntries =
    softphoneHumanTranscript && !isPostCall ? buildSoftphoneAssistantDebugEntries(voiceAi) : [];
  const aiNotes = buildTranscriptAiNotes(voiceAi);
  const headerSubtitle = isPostCall
    ? "Transcript review"
    : softphoneHumanTranscript
      ? "You and your caller"
      : callerLabel;

  const showLiveFlow = !isPostCall;
  const externalCallId = effectiveDesk?.external_call_id ?? null;
  const showActionBar = Boolean(externalCallId) && (messages.length >= 1 || isPostCall);

  const phoneCallIdForSave = (effectiveDesk?.phone_call_id ?? outputPanel?.phoneCallId ?? null) as string | null;

  const runGenerate = useCallback(
    async (kind: OutputKind) => {
      if (!externalCallId) return;
      setSaveFeedback(null);
      setOutputPanel({ kind, loading: true, text: "", error: null, phoneCallId: null });
      const transcriptText = buildTranscriptPlainTextForOperations(voiceAi, {
        callerLabel: callerLabel || "Caller",
      });
      try {
        const res = await fetch("/api/workspace/phone/generate-call-output", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callSid: externalCallId,
            type: kind,
            transcriptText: transcriptText || undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          content?: string;
          error?: string;
          phone_call_id?: string;
        };
        if (!res.ok) {
          setOutputPanel({
            kind,
            loading: false,
            text: "",
            error: j.error ?? `Could not generate (${res.status})`,
            phoneCallId: null,
          });
          return;
        }
        const pid = typeof j.phone_call_id === "string" ? j.phone_call_id : null;
        setOutputPanel({
          kind,
          loading: false,
          text: (j.content ?? "").trim(),
          error: null,
          phoneCallId: pid,
        });
      } catch (e) {
        setOutputPanel({
          kind,
          loading: false,
          text: "",
          error: e instanceof Error ? e.message : "Network error",
          phoneCallId: null,
        });
      }
    },
    [externalCallId, voiceAi, callerLabel]
  );

  const saveOutput = useCallback(async () => {
    if (!outputPanel || outputPanel.loading || saving) return;
    const pid = phoneCallIdForSave;
    if (!pid || !outputPanel.text.trim()) {
      setSaveFeedback({ type: "err", message: "Cannot save — call record or content missing." });
      return;
    }
    setSaving(true);
    setSaveFeedback(null);
    try {
      const res = await fetch("/api/workspace/phone/call-outputs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_call_id: pid,
          type: outputPanel.kind,
          content: outputPanel.text,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setSaveFeedback({ type: "err", message: j.error ?? `Save failed (${res.status})` });
        return;
      }
      setSaveFeedback({ type: "ok", message: "Saved to this call." });
    } catch (e) {
      setSaveFeedback({
        type: "err",
        message: e instanceof Error ? e.message : "Network error while saving",
      });
    } finally {
      setSaving(false);
    }
  }, [outputPanel, phoneCallIdForSave, saving]);

  const copyOutput = useCallback(async () => {
    if (!outputPanel?.text) return;
    try {
      await navigator.clipboard.writeText(outputPanel.text);
    } catch {
      /* ignore */
    }
  }, [outputPanel]);

  useEffect(() => {
    if (!transcriptPanelOpen || !transcriptEnabled || isPostCall) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcriptPanelOpen, transcriptEnabled, isPostCall]);

  useEffect(() => {
    if (!transcriptEnabled || messages.length > 0 || callContextLoadError || transcriptStartPending || isPostCall) {
      queueMicrotask(() => setListeningStall(false));
      return;
    }
    const t = window.setTimeout(() => setListeningStall(true), 15_000);
    return () => window.clearTimeout(t);
  }, [transcriptEnabled, messages.length, callContextLoadError, transcriptStartPending, isPostCall]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && outputPanel) {
        setSaveFeedback(null);
        setOutputPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outputPanel]);

  useEffect(() => {
    if (!saveFeedback || saveFeedback.type !== "ok") return;
    const t = window.setTimeout(() => setSaveFeedback(null), 5000);
    return () => window.clearTimeout(t);
  }, [saveFeedback]);

  if (!transcriptPanelOpen) return null;
  if (status !== "in_call" && !postCallTranscriptSnapshot) return null;

  return (
    <div
      className="fixed inset-0 z-[50] flex flex-col bg-[#0a0f1a]/[0.97] backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Live transcript"
    >
      {outputPanel ? (
        <button
          type="button"
          className="absolute inset-0 z-[51] bg-black/50 transition hover:bg-black/55"
          aria-label="Close generated note panel"
          onClick={() => {
            setSaveFeedback(null);
            setOutputPanel(null);
          }}
        />
      ) : null}

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.12),transparent_55%)]"
        aria-hidden
      />
      <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
              <MessageSquareText className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400/90">Live transcript</p>
              <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-white">{headerSubtitle}</p>
            </div>
            {isPostCall ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/95">
                Call ended
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showLiveFlow && transcriptEnabled && softphoneHumanTranscript ? (
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
            onClick={() => dismissTranscriptPanel()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
            aria-label="Close transcript"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="relative z-[52] flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-2">
          {showLiveFlow && transcriptStartError && !transcriptEnabled ? (
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
          ) : showLiveFlow && transcriptStartPending && !transcriptEnabled ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-2 py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15">
                <Loader2 className="h-7 w-7 animate-spin text-sky-300" aria-hidden />
              </span>
              <p className="mt-6 text-lg font-semibold text-white">Starting live transcript</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Connecting securely. This usually takes a few seconds.
              </p>
            </div>
          ) : showLiveFlow && !transcriptEnabled ? (
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
          ) : showLiveFlow && callContextLoadError ? (
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
            <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-4">
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

          {(transcriptEnabled || isPostCall) &&
          !callContextLoadError &&
          softphoneHumanTranscript &&
          assistantDebugEntries.length > 0 ? (
            <div className="mx-auto mt-2 max-w-xl border-t border-white/[0.06] pt-5">
              <button
                type="button"
                onClick={() => setShowSystemLines((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left text-xs font-medium text-slate-500 transition hover:text-slate-400"
              >
                <span>
                  System-side lines{" "}
                  <span className="text-slate-600">({assistantDebugEntries.length})</span>
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

          {(transcriptEnabled || isPostCall) &&
          !callContextLoadError &&
          aiNotes.length > 0 &&
          !softphoneHumanTranscript ? (
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

        {showActionBar ? (
          <div className="relative z-[52] shrink-0 border-t border-white/[0.07] bg-[#080c14]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md">
            <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                title="Generate SOAP note from this transcript"
                onClick={() => void runGenerate("soap")}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-300/90" aria-hidden />
                Generate SOAP note
              </button>
              <button
                type="button"
                title="Generate call summary from this transcript"
                onClick={() => void runGenerate("summary")}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-300/90" aria-hidden />
                Generate call summary
              </button>
              <button
                type="button"
                title="Generate intake summary from this transcript"
                onClick={() => void runGenerate("intake")}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-300/90" aria-hidden />
                Generate intake summary
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {outputPanel ? (
        <aside
          className="fixed bottom-0 right-0 top-0 z-[53] flex w-full max-w-md flex-col border-l border-white/10 bg-[#0c121c] shadow-2xl"
          role="complementary"
          aria-label="Generated note"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{OUTPUT_TITLES[outputPanel.kind]}</p>
              <p className="text-[11px] text-slate-500">Review and edit before saving</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-300 hover:bg-white/5"
              onClick={() => {
                setSaveFeedback(null);
                setOutputPanel(null);
              }}
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {outputPanel.loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-400" aria-hidden />
                <p className="mt-4 text-sm font-medium text-slate-200">Generating…</p>
                <p className="mt-1 text-xs text-slate-500">This may take a few seconds.</p>
              </div>
            ) : outputPanel.error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-3 py-3 text-sm text-red-100/90">
                {outputPanel.error}
              </div>
            ) : (
              <textarea
                className="min-h-[min(60vh,28rem)] w-full resize-y rounded-xl border border-white/10 bg-[#0a0f18] px-3 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-sky-500/40 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                value={outputPanel.text}
                onChange={(e) =>
                  setOutputPanel((p) => (p ? { ...p, text: e.target.value } : p))
                }
                spellCheck
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            {saveFeedback ? (
              <div
                role="status"
                className={
                  saveFeedback.type === "ok"
                    ? "rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-xs font-medium text-emerald-100/95"
                    : "rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-100/95"
                }
              >
                {saveFeedback.message}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={outputPanel.loading || !outputPanel.text.trim()}
                onClick={() => void copyOutput()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </button>
              <button
                type="button"
                disabled={
                  outputPanel.loading ||
                  saving ||
                  !outputPanel.text.trim() ||
                  !phoneCallIdForSave
                }
                title={
                  !phoneCallIdForSave
                    ? "Call record not loaded yet — generate again or wait for sync"
                    : undefined
                }
                onClick={() => void saveOutput()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-sky-500/35 bg-sky-500/20 px-4 py-2.5 text-xs font-semibold text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-3.5 w-3.5" aria-hidden />
                )}
                Save
              </button>
              <button
                type="button"
                disabled={outputPanel.loading}
                onClick={() => void runGenerate(outputPanel.kind)}
                className="inline-flex w-full min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Regenerate
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
