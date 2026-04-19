"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { formatVoiceAiCallerCategoryLabel, formatVoiceAiRouteTargetLabel } from "@/app/admin/phone/_lib/voice-ai-metadata";

import type { CallContextVoiceAi, SoftphoneConferenceContext } from "@/components/softphone/WorkspaceSoftphoneProvider";
import type { ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";

const SHOW_TECHNICAL_DETAILS = process.env.NODE_ENV === "development";

type Props = {
  voiceAi: CallContextVoiceAi | null;
  conference: SoftphoneConferenceContext | null;
  remoteLabel: string | null;
  /** Server truth from call-context (blockers, SIDs, media URL). */
  conferenceGating: ConferenceGatingSnapshot | null;
  /** When set, controls the technical details drawer (ActiveCallBar passes debug mode). */
  debugExpanded?: boolean;
  onToggleDebug?: () => void;
};

export function LiveCallContextPanel({
  voiceAi,
  conference,
  remoteLabel,
  conferenceGating,
  debugExpanded,
  onToggleDebug,
}: Props) {
  const [localDebug, setLocalDebug] = useState(false);
  const debug = typeof debugExpanded === "boolean" ? debugExpanded : localDebug;
  const toggleDebug = () => {
    if (onToggleDebug) onToggleDebug();
    else setLocalDebug((d) => !d);
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950/90 to-indigo-950/40 p-4 text-left shadow-[0_6px_24px_-12px_rgba(30,58,138,0.25)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-200/80">Context</p>
      {remoteLabel ? (
        <p className="mt-1 text-sm font-semibold text-white">{remoteLabel}</p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Connecting…</p>
      )}

      {conferenceGating && conferenceGating.blockers.length === 0 ? (
        <p className="mt-2 text-[11px] text-emerald-200/90">Advanced calling is ready (hold, transfer, 3-way).</p>
      ) : conferenceGating && conferenceGating.blockers.length > 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-amber-100/90">{conferenceGating.blockers[0]}</p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">Checking server link…</p>
      )}

      {!voiceAi ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Live AI summary appears when this browser leg matches a logged call. Open Transcript for the full live view.
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-xs text-slate-200">
          {voiceAi.short_summary ? (
            <div>
              <p className="font-semibold text-white">AI summary</p>
              <p className="mt-1 leading-relaxed text-slate-200/95">{voiceAi.short_summary}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {voiceAi.urgency ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-100">
                Urgency: {voiceAi.urgency}
              </span>
            ) : null}
            {voiceAi.route_target ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-100">
                Route: {formatVoiceAiRouteTargetLabel(voiceAi.route_target)}
              </span>
            ) : null}
            {voiceAi.caller_category ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-100">
                {formatVoiceAiCallerCategoryLabel(voiceAi.caller_category)}
              </span>
            ) : null}
          </div>
          {voiceAi.recommended_action ? (
            <div>
              <p className="font-semibold text-white">Suggested action</p>
              <p className="mt-1 leading-relaxed text-slate-200/95">{voiceAi.recommended_action}</p>
            </div>
          ) : null}
        </div>
      )}

      {SHOW_TECHNICAL_DETAILS ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleDebug}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-[11px] font-semibold text-indigo-100/90"
          >
            <span>Technical details</span>
            {debug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {debug ? (
            <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] leading-snug text-slate-300">
              {conference?.mode === "conference" ? (
                <p>
                  Conference
                  {conference.conference_sid ? (
                    <span className="ml-1 font-mono text-[10px] text-slate-400">
                      {conference.conference_sid.slice(0, 10)}…
                    </span>
                  ) : (
                    <span className="text-amber-200"> — linking…</span>
                  )}
                  {conference.pstn_call_sid ? (
                    <span className="ml-1 font-mono text-[10px] text-emerald-300">· PSTN</span>
                  ) : (
                    <span className="text-amber-200"> · PSTN not linked</span>
                  )}
                </p>
              ) : null}
              {conferenceGating ? (
                <>
                  <p>
                    <span className="text-slate-500">Client leg:</span>{" "}
                    <span className="font-mono text-[10px] text-slate-100">
                      {conferenceGating.client_leg_call_sid ? `${conferenceGating.client_leg_call_sid.slice(0, 10)}…` : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Conference SID:</span>{" "}
                    <span className="font-mono text-[10px] text-slate-100">
                      {conferenceGating.conference_sid ? `${conferenceGating.conference_sid.slice(0, 10)}…` : "missing"}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">PSTN leg:</span>{" "}
                    <span className="font-mono text-[10px] text-slate-100">
                      {conferenceGating.pstn_call_sid ? `${conferenceGating.pstn_call_sid.slice(0, 10)}…` : "missing"}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Media stream (masked):</span>{" "}
                    <span className="font-mono text-[10px] text-slate-100">
                      {conferenceGating.media_stream_wss_target_masked ?? "not resolved"}
                    </span>
                  </p>
                  {conferenceGating.blockers.length > 1 ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-amber-100/90">
                      {conferenceGating.blockers.slice(1).map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500">Loading diagnostics…</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
        <p className="text-xs font-semibold text-white">Transcript excerpt</p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          From call metadata — open the Transcript tab for the full live stream.
        </p>
        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-white/5 bg-slate-950/50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
          {voiceAi?.live_transcript_excerpt?.trim() ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Bridge / AI</p>
              <p className="mt-1 whitespace-pre-wrap">{voiceAi.live_transcript_excerpt}</p>
            </>
          ) : (
            <p className="text-slate-500">No excerpt yet — enable Transcript when you are ready.</p>
          )}
        </div>
      </div>
    </div>
  );
}
