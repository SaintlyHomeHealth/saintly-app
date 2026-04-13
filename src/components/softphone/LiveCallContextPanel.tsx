"use client";

import { formatVoiceAiCallerCategoryLabel, formatVoiceAiRouteTargetLabel } from "@/app/admin/phone/_lib/voice-ai-metadata";

import type { CallContextVoiceAi, SoftphoneConferenceContext } from "@/components/softphone/WorkspaceSoftphoneProvider";
import type { ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";

type Props = {
  voiceAi: CallContextVoiceAi | null;
  conference: SoftphoneConferenceContext | null;
  remoteLabel: string | null;
  /** Server truth from call-context (blockers, SIDs, media URL). */
  conferenceGating: ConferenceGatingSnapshot | null;
};

export function LiveCallContextPanel({ voiceAi, conference, remoteLabel, conferenceGating }: Props) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-sky-100/80 bg-gradient-to-b from-white to-sky-50/40 p-4 text-left shadow-[0_6px_24px_-12px_rgba(30,58,138,0.12)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Caller context</p>
      {remoteLabel ? (
        <p className="mt-1 text-sm font-semibold text-slate-900">{remoteLabel}</p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Connecting…</p>
      )}
      {conference?.mode === "conference" ? (
        <p className="mt-2 text-[11px] text-slate-600">
          Conference leg
          {conference.conference_sid ? (
            <span className="ml-1 font-mono text-[10px] text-slate-500">
              {conference.conference_sid.slice(0, 8)}…
            </span>
          ) : (
            <span className="text-amber-800"> — linking…</span>
          )}
          {conference.pstn_call_sid ? (
            <span className="ml-1 font-mono text-[10px] text-emerald-800">· PSTN</span>
          ) : (
            <span className="text-amber-800"> · PSTN not linked</span>
          )}
        </p>
      ) : null}
      {conferenceGating ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200/90 bg-slate-50/90 px-2 py-1.5 text-[10px] leading-snug text-slate-700">
          <p className="font-semibold text-slate-800">Diagnostics</p>
          <p>
            <span className="text-slate-500">Client leg:</span>{" "}
            <span className="font-mono text-[10px] text-slate-900">
              {conferenceGating.client_leg_call_sid ? `${conferenceGating.client_leg_call_sid.slice(0, 10)}…` : "—"}
            </span>
          </p>
          <p>
            <span className="text-slate-500">Conference SID:</span>{" "}
            <span className="font-mono text-[10px] text-slate-900">
              {conferenceGating.conference_sid ? `${conferenceGating.conference_sid.slice(0, 10)}…` : "missing"}
            </span>
          </p>
          <p>
            <span className="text-slate-500">PSTN leg:</span>{" "}
            <span className="font-mono text-[10px] text-slate-900">
              {conferenceGating.pstn_call_sid ? `${conferenceGating.pstn_call_sid.slice(0, 10)}…` : "missing"}
            </span>
          </p>
          <p>
            <span className="text-slate-500">Media stream WSS (masked):</span>{" "}
            <span className="font-mono text-[10px] text-slate-900">
              {conferenceGating.media_stream_wss_target_masked ?? "not resolved"}
            </span>
          </p>
          {conferenceGating.blockers.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-amber-950">
              {conferenceGating.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-emerald-900">No blockers — server sees conference + PSTN + media + transcript writeback.</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">Loading server diagnostics…</p>
      )}
      {!voiceAi ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Live AI summary appears when this browser leg matches a phone_calls row (same Twilio Call SID). Transcript
          updates below from server metadata (bridge + voice AI).
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
        </div>
      )}
      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-900">Live transcript (excerpt)</p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Pulled from phone call metadata on this leg
          {conferenceGating?.client_leg_call_sid
            ? ` (${conferenceGating.client_leg_call_sid.slice(0, 10)}…)`
            : ""}
          . Refreshes about every 2s while you are in a call.
        </p>
        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-sky-100/80 bg-white/90 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
          {voiceAi?.live_transcript_excerpt?.trim() ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">AI Receptionist</p>
              <p className="mt-1 whitespace-pre-wrap">{voiceAi.live_transcript_excerpt}</p>
            </>
          ) : (
            <p className="text-slate-500">
              Transcript will appear when available — start the media stream if you use the live bridge, or wait for
              voice AI to write lines to this call.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
