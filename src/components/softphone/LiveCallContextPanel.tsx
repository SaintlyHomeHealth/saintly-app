"use client";

import { formatVoiceAiCallerCategoryLabel, formatVoiceAiRouteTargetLabel } from "@/app/admin/phone/_lib/voice-ai-metadata";

import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";

type Props = {
  voiceAi: CallContextVoiceAi | null;
  remoteLabel: string | null;
};

export function LiveCallContextPanel({ voiceAi, remoteLabel }: Props) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-sky-100/80 bg-gradient-to-b from-white to-sky-50/40 p-4 text-left shadow-[0_6px_24px_-12px_rgba(30,58,138,0.12)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Caller context</p>
      {remoteLabel ? (
        <p className="mt-1 text-sm font-semibold text-slate-900">{remoteLabel}</p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Connecting…</p>
      )}
      {!voiceAi ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Live AI summary and transcript appear here when the call is linked to Saintly voice AI (same Twilio Call SID
          in our logs).
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-xs text-slate-700">
          {voiceAi.short_summary ? (
            <div>
              <p className="font-semibold text-slate-900">AI summary</p>
              <p className="mt-1 leading-relaxed">{voiceAi.short_summary}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {voiceAi.urgency ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                Urgency: {voiceAi.urgency}
              </span>
            ) : null}
            {voiceAi.route_target ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                Route: {formatVoiceAiRouteTargetLabel(voiceAi.route_target)}
              </span>
            ) : null}
            {voiceAi.caller_category ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                {formatVoiceAiCallerCategoryLabel(voiceAi.caller_category)}
              </span>
            ) : null}
          </div>
          {voiceAi.recommended_action ? (
            <div>
              <p className="font-semibold text-slate-900">Suggested action</p>
              <p className="mt-1 leading-relaxed">{voiceAi.recommended_action}</p>
            </div>
          ) : null}
          <div>
            <p className="font-semibold text-slate-900">Live transcript (excerpt)</p>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-sky-100/80 bg-white/90 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
              {voiceAi.live_transcript_excerpt ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">AI Receptionist</p>
                  <p className="mt-1 whitespace-pre-wrap">{voiceAi.live_transcript_excerpt}</p>
                </>
              ) : (
                <p className="text-slate-500">No live transcript excerpt yet for this leg.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
