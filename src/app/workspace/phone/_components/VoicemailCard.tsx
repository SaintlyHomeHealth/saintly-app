"use client";

import Link from "next/link";

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
  compact?: boolean;
};

const actionBtnCls =
  "inline-flex min-h-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50";
const actionPrimaryCls =
  "inline-flex min-h-[32px] items-center justify-center rounded-xl bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800";

export function VoicemailCard({
  callId,
  title,
  subtitle,
  whenLabel,
  durationLabel,
  callbackPhone,
  threadHref,
  patientHref,
  compact = false,
}: Props) {
  return (
    <li
      className={`rounded-2xl bg-white/90 px-3 py-2.5 text-xs ring-1 ring-violet-100/80 ${
        compact ? "space-y-2" : "space-y-2.5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {whenLabel} · {durationLabel}
          </p>
        </div>
        {patientHref ? (
          <Link href={patientHref} className="shrink-0 text-[11px] font-semibold text-violet-900 hover:underline">
            Patient
          </Link>
        ) : null}
      </div>

      <audio controls preload="none" className="w-full" src={`/api/workspace/phone/voicemail/${callId}/audio`}>
        Your browser does not support audio playback.
      </audio>

      <div className="flex flex-wrap gap-1.5">
        {callbackPhone ? (
          <DialSoftphoneButton e164={callbackPhone} label="Call back" className={actionPrimaryCls} />
        ) : (
          <span className={`${actionPrimaryCls} cursor-not-allowed opacity-40`}>Call back</span>
        )}
        {threadHref ? (
          <>
            <Link href={threadHref} className={actionBtnCls}>
              Text patient
            </Link>
            <Link href={threadHref} className={actionBtnCls}>
              Open thread
            </Link>
          </>
        ) : (
          <>
            <span className={`${actionBtnCls} cursor-not-allowed text-slate-400`}>Text patient</span>
            <span className={`${actionBtnCls} cursor-not-allowed text-slate-400`}>Open thread</span>
          </>
        )}
      </div>
    </li>
  );
}
