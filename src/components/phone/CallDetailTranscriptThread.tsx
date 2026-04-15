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
    ? "rounded-xl border border-slate-200/90 bg-slate-50 px-3.5 py-2.5 text-slate-800 shadow-sm"
    : isYou
      ? "rounded-xl rounded-br-sm border border-sky-400/35 bg-gradient-to-br from-sky-600 to-blue-700 px-3.5 py-2.5 text-white shadow-sm shadow-sky-900/10"
      : isSaintly
        ? "rounded-xl rounded-tl-sm border border-indigo-200/70 bg-gradient-to-b from-indigo-50/90 to-white px-3.5 py-2.5 text-indigo-950 shadow-sm"
        : "rounded-xl rounded-tl-sm border border-slate-200/90 bg-white px-3.5 py-2.5 text-slate-900 shadow-sm";

  const labelClass = isYou
    ? "text-white/85"
    : isSaintly
      ? "text-indigo-700/85"
      : isUnknown
        ? "text-slate-500"
        : "text-slate-500";

  const timeClass = isYou ? "text-sky-100/80" : "text-slate-400";

  return (
    <div className={`flex w-full ${align}`}>
      <div className={`max-w-[min(100%,26rem)] ${bubbleClass}`}>
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>{label}</p>
          {time ? (
            <time dateTime={msg.ts} className={`shrink-0 text-[10px] font-medium tabular-nums ${timeClass}`}>
              {time}
            </time>
          ) : null}
        </div>
        <p
          className={`mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.5] tracking-[-0.01em] ${
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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 to-white shadow-inner shadow-slate-900/[0.04]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Conversation</span>
        <span className="rounded-full bg-slate-100/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
          {count} {count === 1 ? "line" : "lines"}
        </span>
      </div>
      <div className="max-h-[min(520px,62vh)] overflow-y-auto overscroll-contain px-3.5 py-3.5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2.5">
          {bubbles.map((m) => (
            <Bubble key={m.id} msg={m} callerLabel={callerLabel} />
          ))}
        </div>
      </div>
    </div>
  );
}
