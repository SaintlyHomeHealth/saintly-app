"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Mic, MicOff, PauseCircle, PhoneOff, PlayCircle } from "lucide-react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

import { LiveCallContextPanel } from "@/components/softphone/LiveCallContextPanel";

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ActiveCallBar() {
  const {
    status,
    activeRemoteLabel,
    durationSec,
    hangUp,
    micMuted,
    isClientHold,
    isPstnHold,
    holdBusy,
    toggleMute,
    toggleHold,
    callContext,
    softphoneCapabilities,
  } = useWorkspaceSoftphone();
  const [ctxOpen, setCtxOpen] = useState(false);

  if (status !== "in_call") return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-[43] px-4 pb-2 sm:px-5">
      <div className="mx-auto w-full max-w-6xl space-y-2">
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sky-400/40 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 px-3 py-2.5 text-sky-50 shadow-xl shadow-blue-950/40">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{activeRemoteLabel ?? "On call"}</p>
            <p className="text-[11px] font-medium text-sky-200">
              {isPstnHold ? "PSTN on hold · " : isClientHold ? "Local hold · " : null}
              Duration {formatDuration(durationSec)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={isClientHold || holdBusy}
              title={isClientHold ? "Unhold to change mute" : micMuted ? "Unmute" : "Mute"}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-400/35 ${
                micMuted ? "bg-sky-500/25 text-white" : "text-sky-100"
              } disabled:opacity-40`}
            >
              {micMuted ? <MicOff className="h-4 w-4" strokeWidth={2} /> : <Mic className="h-4 w-4" strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={() => void toggleHold()}
              disabled={holdBusy}
              title={isPstnHold || isClientHold ? "Resume" : "Hold"}
              className={`inline-flex h-9 items-center justify-center gap-1 rounded-full border border-sky-400/35 px-2.5 text-xs font-semibold ${
                isPstnHold || isClientHold ? "bg-amber-500/30 text-amber-50" : "text-sky-100"
              } disabled:opacity-40`}
            >
              {holdBusy ? (
                <>
                  <PauseCircle className="h-4 w-4" strokeWidth={2} />
                  …
                </>
              ) : isPstnHold || isClientHold ? (
                <>
                  <PlayCircle className="h-4 w-4" strokeWidth={2} />
                  Resume
                </>
              ) : (
                <>
                  <PauseCircle className="h-4 w-4" strokeWidth={2} />
                  Hold
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setCtxOpen((o) => !o)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-sky-400/35 px-2.5 text-xs font-semibold text-sky-100"
            >
              Context
              {ctxOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={hangUp}
              className="inline-flex h-10 items-center gap-1 rounded-full bg-red-500 px-3 text-sm font-semibold text-white hover:bg-red-600"
            >
              <PhoneOff className="h-4 w-4" strokeWidth={2} />
              End
            </button>
          </div>
        </div>
        {ctxOpen ? (
          <div className="rounded-2xl border border-sky-200/40 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur">
            <LiveCallContextPanel
              voiceAi={callContext?.voice_ai ?? null}
              conference={callContext?.conference ?? null}
              remoteLabel={activeRemoteLabel}
              transcriptConfigured={Boolean(softphoneCapabilities?.media_stream_wss_configured)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
