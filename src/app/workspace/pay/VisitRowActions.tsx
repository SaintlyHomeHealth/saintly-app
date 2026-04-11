"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { endVisitAction, refreshVisitPayrollAction, requestOfficeReviewAction } from "./visit-actions";

export function VisitRowActions({
  visitId,
  locked,
  canEndVisit,
  showRequestReview,
}: {
  visitId: string;
  locked: boolean;
  canEndVisit: boolean;
  showRequestReview: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function doRefresh() {
    setMsg(null);
    setPending("refresh");
    try {
      const r = await refreshVisitPayrollAction(visitId);
      setMsg(r.ok ? "Payroll status refreshed." : r.error);
      if (r.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function doReview() {
    setMsg(null);
    setPending("review");
    try {
      const r = await requestOfficeReviewAction(visitId);
      setMsg(r.ok ? "Office review requested." : r.error);
      if (r.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function doEnd() {
    if (!window.confirm("End this visit and clock out?")) return;
    setMsg(null);
    setPending("end");
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
          /* optional */
        }
      }
      const r = await endVisitAction({ visitId, checkOutLat: lat, checkOutLng: lng });
      setMsg(r.ok ? "Visit ended." : r.error);
      if (r.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <details className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">View details</summary>
        <p className="mt-1 break-all text-[10px] text-slate-500">Visit ID: {visitId}</p>
      </details>
      {locked ? (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">View only · payroll locked</span>
      ) : (
        <>
          {canEndVisit ? (
            <button
              type="button"
              disabled={pending !== null}
              onClick={doEnd}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending === "end" ? "Ending…" : "End visit"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending !== null}
            onClick={doRefresh}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending === "refresh" ? "Refreshing…" : "Refresh payroll"}
          </button>
          {showRequestReview ? (
            <button
              type="button"
              disabled={pending !== null}
              onClick={doReview}
              className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
            >
              {pending === "review" ? "Sending…" : "Request office review"}
            </button>
          ) : null}
        </>
      )}
      {msg ? <p className="text-[11px] text-slate-600">{msg}</p> : null}
    </div>
  );
}
