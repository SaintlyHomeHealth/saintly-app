"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import { DialSoftphoneButton } from "@/app/workspace/phone/patients/_components/DialSoftphoneButton";
import {
  rescheduleWorkspaceVisit,
  setWorkspaceVisitStatus,
} from "@/app/workspace/phone/patients/actions";

function statusBadgeClass(statusKey: string): string {
  const s = statusKey.trim().toLowerCase();
  if (s === "confirmed") return "bg-violet-100 text-violet-900 ring-violet-200/80";
  if (s === "scheduled") return "bg-slate-100 text-slate-800 ring-slate-200/80";
  if (s === "en_route") return "bg-sky-100 text-sky-900 ring-sky-200/80";
  if (s === "arrived") return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
  if (s === "completed") return "bg-slate-100 text-slate-600 ring-slate-200/60";
  if (s === "missed" || s === "canceled") return "bg-red-50 text-red-800 ring-red-200/70";
  if (s === "rescheduled") return "bg-amber-50 text-amber-900 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-slate-200/80";
}

type Props = {
  visitId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  addressLine: string | null;
  whenLabel: string;
  statusKey: string;
  statusLabel: string;
  reminderLabel: string;
  reminderStateLabel: string;
  enRouteAtLabel: string | null;
  arrivedAtLabel: string | null;
  completedAtLabel: string | null;
  onSiteDurationLabel: string | null;
  locationCapturedLabel: string | null;
  mapsHref: string | null;
  inboxHref: string | null;
  canConfirm: boolean;
  canEnRoute: boolean;
  canArrived: boolean;
  canComplete: boolean;
  canMissed: boolean;
  canReschedule: boolean;
};

const btnCls =
  "inline-flex min-h-[34px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimaryCls =
  "inline-flex min-h-[34px] items-center justify-center rounded-xl bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

function readCurrentPositionOrNull(): Promise<{ lat: number; lng: number; accuracyMeters: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters:
            Number.isFinite(pos.coords.accuracy) && pos.coords.accuracy >= 0 ? pos.coords.accuracy : null,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 5000 }
    );
  });
}

export function TodayVisitCard(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [showReschedule, setShowReschedule] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const nowDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const runStatus = (nextStatus: string) => {
    setFeedback(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("visitId", props.visitId);
      fd.set("nextStatus", nextStatus);
      if (nextStatus === "arrived" || nextStatus === "completed") {
        const geo = await readCurrentPositionOrNull();
        if (geo) {
          fd.set("lat", String(geo.lat));
          fd.set("lng", String(geo.lng));
          if (geo.accuracyMeters != null) {
            fd.set("accuracyMeters", String(geo.accuracyMeters));
          }
        }
      }
      const out = await setWorkspaceVisitStatus(fd);
      setFeedback(out.ok ? "Saved." : out.error);
    });
  };

  const onReschedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    fd.set("visitId", props.visitId);
    startTransition(async () => {
      const out = await rescheduleWorkspaceVisit(fd);
      setFeedback(out.ok ? "Visit rescheduled." : out.error);
      if (out.ok) setShowReschedule(false);
    });
  };

  return (
    <li className="rounded-2xl bg-white/95 p-3.5 shadow-sm shadow-slate-200/45 ring-1 ring-slate-200/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{props.patientName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{props.whenLabel}</p>
          {props.addressLine ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{props.addressLine}</p> : null}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${statusBadgeClass(props.statusKey)}`}
        >
          {props.statusLabel}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
          {props.reminderLabel}
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          {props.reminderStateLabel}
        </span>
        {props.locationCapturedLabel ? (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
            {props.locationCapturedLabel}
          </span>
        ) : null}
      </div>

      {(props.enRouteAtLabel || props.arrivedAtLabel || props.completedAtLabel || props.onSiteDurationLabel) ? (
        <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
          {props.enRouteAtLabel ? <p>En route {props.enRouteAtLabel}</p> : null}
          {props.arrivedAtLabel ? <p>Arrived {props.arrivedAtLabel}</p> : null}
          {props.completedAtLabel ? <p>Completed {props.completedAtLabel}</p> : null}
          {props.onSiteDurationLabel ? <p>On-site duration {props.onSiteDurationLabel}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
        <Link href={`/workspace/phone/patients/${props.patientId}`} className={btnPrimaryCls}>
          Open patient
        </Link>
        {props.patientPhone ? (
          <DialSoftphoneButton e164={props.patientPhone} label="Call patient" className={btnCls} />
        ) : (
          <span className={`${btnCls} text-slate-400`}>Call patient</span>
        )}
        {props.inboxHref ? (
          <Link href={props.inboxHref} className={btnCls}>
            Text patient
          </Link>
        ) : (
          <span className={`${btnCls} text-slate-400`}>Text patient</span>
        )}
        {props.mapsHref ? (
          <a href={props.mapsHref} target="_blank" rel="noreferrer" className={btnCls}>
            Open maps
          </a>
        ) : (
          <span className={`${btnCls} text-slate-400`}>Open maps</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {props.canConfirm ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => runStatus("confirmed")}>
            Confirm visit
          </button>
        ) : null}
        {props.canEnRoute ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => runStatus("en_route")}>
            Mark en route
          </button>
        ) : null}
        {props.canArrived ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => runStatus("arrived")}>
            Mark arrived
          </button>
        ) : null}
        {props.canComplete ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => runStatus("completed")}>
            Mark complete
          </button>
        ) : null}
        {props.canMissed ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => runStatus("missed")}>
            Mark missed
          </button>
        ) : null}
        {props.canReschedule ? (
          <button type="button" className={btnCls} disabled={isPending} onClick={() => setShowReschedule((v) => !v)}>
            Reschedule
          </button>
        ) : null}
      </div>

      {showReschedule ? (
        <form onSubmit={onReschedule} className="mt-2.5 grid grid-cols-2 gap-1.5">
          <input
            name="visitDate"
            type="date"
            required
            min={nowDate}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
          <input
            name="visitTime"
            type="time"
            required
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
          <button type="submit" disabled={isPending} className={`${btnPrimaryCls} col-span-2`}>
            Save reschedule
          </button>
        </form>
      ) : null}

      {feedback ? <p className="mt-2 text-[11px] text-slate-600">{feedback}</p> : null}
    </li>
  );
}
