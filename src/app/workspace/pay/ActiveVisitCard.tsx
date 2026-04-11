"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { endVisitAction } from "./visit-actions";

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ActiveVisitCard({
  visitId,
  patientName,
  visitType,
  checkInIso,
}: {
  visitId: string;
  patientName: string;
  visitType: string;
  checkInIso: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsedSec = useMemo(() => {
    const start = Date.parse(checkInIso);
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((now - start) / 1000));
  }, [checkInIso, now]);

  async function onEnd() {
    if (!window.confirm("End this visit and clock out now?")) return;
    setMessage(null);
    setPending(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // optional GPS
        }
      }
      const r = await endVisitAction({ visitId, checkOutLat: lat, checkOutLng: lng });
      if (r.ok) {
        setMessage("Visit ended. Complete your note in Alora if it is still outstanding.");
        router.refresh();
      } else {
        setMessage(r.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/50 p-4 shadow-sm shadow-emerald-100/40">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-900/80">Active visit</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-slate-900">{patientName}</p>
          <p className="text-sm text-slate-600 capitalize">{visitType.replace(/_/g, " ")}</p>
          <p className="mt-2 text-xs text-slate-600">
            Checked in <span className="font-semibold text-slate-800">{fmtClock(checkInIso)}</span>
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-900">{formatDuration(elapsedSec)}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onEnd}
          className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-500 hover:to-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Ending…" : "End visit"}
        </button>
      </div>
      {message ? (
        <p
          className={`mt-3 text-sm ${message.startsWith("Visit ended") ? "text-emerald-800" : "text-rose-700"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
