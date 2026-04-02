"use client";

import { Mic, PhoneOff } from "lucide-react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ActiveCallBar() {
  const { status, activeRemoteLabel, durationSec, hangUp } = useWorkspaceSoftphone();
  if (status !== "in_call") return null;

  return (
    <div className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-[41] px-4 pb-2 sm:px-5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-950 px-3 py-2.5 text-emerald-50 shadow-xl shadow-black/20">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{activeRemoteLabel ?? "On call"}</p>
          <p className="text-[11px] font-medium text-emerald-200">Duration {formatDuration(durationSec)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled
            title="Mute coming soon"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/40 text-emerald-200 opacity-70"
          >
            <Mic className="h-4 w-4" strokeWidth={2} />
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
    </div>
  );
}
