"use client";

import Link from "next/link";

import { createPhoneCallTask } from "@/app/admin/phone/actions";
import { DialSoftphoneButton } from "@/app/workspace/phone/patients/_components/DialSoftphoneButton";

type Props = {
  callId: string;
  title: string;
  subtitle: string;
  whenLabel: string;
  durationLabel: string;
  callbackPhone: string | null;
  threadHref: string | null;
  patientHref?: string | null;
  transcript: string | null;
  /** metadata.voicemail_transcription.status — queued | processing | completed | failed */
  transcriptStatus: string | null;
  transcriptError: string | null;
  aiRecap: string | null;
  compact?: boolean;
};

const actionBtnCls =
  "inline-flex min-h-[32px] items-center justify-center rounded-xl border border-sky-200/90 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-phone-ink transition hover:bg-phone-ice";
const actionPrimaryCls =
  "inline-flex min-h-[32px] items-center justify-center rounded-xl bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105";

const placeholderCls =
  "rounded-xl border border-dashed border-sky-200/80 bg-phone-powder/50 px-2.5 py-2 text-[11px] leading-snug text-slate-600";

export function VoicemailCard({
  callId,
  title,
  subtitle,
  whenLabel,
  durationLabel,
  callbackPhone,
  threadHref,
  patientHref,
  transcript,
  transcriptStatus,
  transcriptError,
  aiRecap,
  compact = false,
}: Props) {
  const followUpTitle = `Voicemail follow-up — ${title}`.slice(0, 500);

  const transcriptPending =
    !transcript &&
    (transcriptStatus === "queued" || transcriptStatus === "processing" || transcriptStatus === "pending");

  const transcriptBody = transcript ? (
    <p className="rounded-xl border border-sky-100/90 bg-phone-ice/70 px-2.5 py-2 text-[11px] leading-snug text-slate-800">
      {transcript}
    </p>
  ) : transcriptPending ? (
    <p className={placeholderCls}>Transcript processing…</p>
  ) : transcriptStatus === "failed" ? (
    <p className={placeholderCls}>{transcriptError || "Transcript could not be generated."}</p>
  ) : (
    <p className={placeholderCls}>Transcript will appear shortly after the message is processed.</p>
  );

  return (
    <li
      className={`ws-phone-card px-3 py-2.5 text-xs ${compact ? "space-y-2" : "space-y-2.5"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-phone-navy">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {whenLabel} · {durationLabel}
          </p>
        </div>
        {patientHref ? (
          <Link href={patientHref} className="shrink-0 text-[11px] font-semibold text-phone-ink hover:underline">
            Patient
          </Link>
        ) : null}
      </div>

      <audio controls preload="metadata" className="w-full" src={`/api/workspace/phone/voicemail/${callId}/audio`}>
        Your browser does not support audio playback.
      </audio>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Transcript</p>
        {transcriptBody}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">AI recap</p>
        {aiRecap ? (
          <p className="rounded-xl border border-sky-100/90 bg-phone-powder/60 px-2.5 py-2 text-[11px] leading-snug text-slate-800">
            {aiRecap}
          </p>
        ) : transcriptPending ? (
          <p className={placeholderCls}>AI recap processing…</p>
        ) : (
          <p className={placeholderCls}>
            AI summary appears after the call is processed (background voice classification on the call record).
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {callbackPhone ? (
          <DialSoftphoneButton e164={callbackPhone} label="Call back" className={actionPrimaryCls} />
        ) : (
          <span className={`${actionPrimaryCls} cursor-not-allowed opacity-40`}>Call back</span>
        )}
        {threadHref ? (
          <Link href={threadHref} className={actionBtnCls}>
            Open thread
          </Link>
        ) : (
          <span className={`${actionBtnCls} cursor-not-allowed text-slate-400`}>Open thread</span>
        )}
        <form action={createPhoneCallTask} className="inline">
          <input type="hidden" name="phoneCallId" value={callId} />
          <input type="hidden" name="title" value={followUpTitle} />
          <button type="submit" className={actionBtnCls}>
            Create follow-up
          </button>
        </form>
      </div>
    </li>
  );
}
