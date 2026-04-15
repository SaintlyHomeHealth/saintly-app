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
    ? "rounded-2xl border border-slate-200/90 bg-slate-100/90 px-4 py-3 text-slate-800 shadow-sm"
    : isYou
      ? "rounded-2xl rounded-br-md border border-sky-300/50 bg-gradient-to-br from-sky-600 to-blue-700 px-4 py-3 text-white shadow-md shadow-sky-900/10"
      : isSaintly
        ? "rounded-2xl rounded-tl-md border border-indigo-200/80 bg-gradient-to-b from-indigo-50 to-white px-4 py-3 text-indigo-950 shadow-sm"
        : "rounded-2xl rounded-tl-md border border-slate-200/90 bg-white px-4 py-3 text-slate-900 shadow-sm";

  const labelClass = isYou
    ? "text-white/90"
    : isSaintly
      ? "text-indigo-700/90"
      : isUnknown
        ? "text-slate-600"
        : "text-slate-600";

  const timeClass = isYou ? "text-sky-100/85" : "text-slate-400";

  return (
    <div className={`flex w-full ${align}`}>
      <div className={`max-w-[min(100%,26rem)] ${bubbleClass}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${labelClass}`}>{label}</p>
          {time ? (
            <time dateTime={msg.ts} className={`shrink-0 text-[10px] font-medium tabular-nums ${timeClass}`}>
              {time}
            </time>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed tracking-[-0.01em]">{msg.text}</p>
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
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
        <p className="text-sm font-medium text-slate-800">No transcript on this call</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Transcript lines appear when live capture stored entries under{" "}
          <code className="rounded bg-white px-1 text-[11px]">metadata.voice_ai</code>, or a legacy rolling excerpt
          is present.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[min(560px,65vh)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/50 to-white px-4 py-5 shadow-inner shadow-slate-900/[0.03]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {bubbles.map((m) => (
          <Bubble key={m.id} msg={m} callerLabel={callerLabel} />
        ))}
      </div>
    </div>
  );
}
