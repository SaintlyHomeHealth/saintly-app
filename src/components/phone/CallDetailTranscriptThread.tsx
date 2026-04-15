import { MessageSquareText } from "lucide-react";

import {
  transcriptSpeakerLabel,
  type TranscriptBubble,
} from "@/components/softphone/build-transcript-messages";

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

function Bubble({
  msg,
  callerLabel,
}: {
  msg: TranscriptBubble;
  callerLabel: string;
}) {
  const softphoneTranscript = true;
  const isSaintly = msg.speaker === "saintly";
  const isUnknown = msg.speaker === "unknown";
  const isYou = msg.speaker === "local";

  const label = transcriptSpeakerLabel(msg.speaker, callerLabel, { softphoneTranscript });
  const time = formatTranscriptTime(msg.ts);
  const align = isUnknown ? "justify-center" : isYou ? "justify-end" : "justify-start";

  const bubbleClass = isUnknown
    ? "rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-2 text-slate-800"
    : isYou
      ? "rounded-lg rounded-br-[4px] border border-sky-400/30 bg-gradient-to-br from-sky-600 to-blue-700 px-3 py-2 text-white"
      : isSaintly
        ? "rounded-lg rounded-tl-[4px] border border-indigo-200/60 bg-gradient-to-b from-indigo-50/90 to-white px-3 py-2 text-indigo-950"
        : "rounded-lg rounded-tl-[4px] border border-slate-200/90 bg-white px-3 py-2 text-slate-900";

  const labelClass = isYou
    ? "text-white/80"
    : isSaintly
      ? "text-indigo-700/80"
      : isUnknown
        ? "text-slate-500"
        : "text-slate-500";

  const timeClass = isYou ? "text-sky-100/55" : "text-slate-400/70";

  return (
    <div className={`flex w-full ${align} px-0.5`}>
      <div className={`max-w-md ${bubbleClass}`}>
        <div className="flex items-baseline justify-between gap-1.5">
          <p className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${labelClass}`}>{label}</p>
          {time ? (
            <time dateTime={msg.ts} className={`shrink-0 text-[9px] font-medium tabular-nums ${timeClass}`}>
              {time}
            </time>
          ) : null}
        </div>
        <p
          className={`mt-1 whitespace-pre-wrap text-sm leading-snug tracking-[-0.01em] ${
            isYou ? "text-white" : isSaintly ? "text-indigo-950" : isUnknown ? "text-slate-800" : "text-slate-900"
          }`}
        >
          {msg.text}
        </p>
      </div>
    </div>
  );
}

export type CallDetailTranscriptThreadProps = {
  bubbles: TranscriptBubble[];
  callerLabel: string;
};

/**
 * Read-only transcript thread for admin call detail (same speaker model as softphone transcript sheet).
 */
export function CallDetailTranscriptThread({ bubbles, callerLabel }: CallDetailTranscriptThreadProps) {
  if (bubbles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-400 shadow-sm">
          <MessageSquareText className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
        <p className="mt-4 text-[15px] font-semibold tracking-tight text-slate-800">No transcript for this call</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600">
          Nothing was captured in <code className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[12px]">voice_ai</code> yet.
          After a live-transcript call, lines appear here automatically.
        </p>
      </div>
    );
  }

  const count = bubbles.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 to-white shadow-inner shadow-slate-900/[0.03]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 bg-white/95 px-3 py-2 backdrop-blur-sm">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Conversation</span>
        <span className="rounded-md bg-slate-100/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
          {count} {count === 1 ? "line" : "lines"}
        </span>
      </div>
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-4 bg-gradient-to-b from-slate-50/90 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-4 bg-gradient-to-t from-white/95 to-transparent"
          aria-hidden
        />
        <div className="max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain px-2 py-3">
          <div className="mx-auto flex w-full max-w-md flex-col gap-2">
            {bubbles.map((m) => (
              <Bubble key={m.id} msg={m} callerLabel={callerLabel} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
