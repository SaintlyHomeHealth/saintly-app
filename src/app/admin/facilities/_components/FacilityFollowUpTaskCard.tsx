"use client";

import Link from "next/link";

import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import {
  FOLLOW_UP_SOURCE_LABELS,
  type FollowUpTaskCard,
} from "@/lib/crm/facility-follow-up-task-types";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

export type FacilityFollowUpTaskCardProps = {
  task: FollowUpTaskCard;
  compact?: boolean;
  showCancel?: boolean;
  onComplete?: (task: FollowUpTaskCard) => void;
  onSnooze?: (task: FollowUpTaskCard) => void;
  onReschedule?: (task: FollowUpTaskCard) => void;
  onCancel?: (task: FollowUpTaskCard) => void;
  onActionDone?: () => void;
};

function priorityBadge(priority: string | null): { label: string; cls: string } | null {
  if (priority === "High") return { label: "High", cls: "bg-rose-50 text-rose-900 ring-rose-200" };
  if (priority === "Low") return { label: "Low", cls: "bg-slate-50 text-slate-700 ring-slate-200" };
  if (priority === "Normal") return { label: "Normal", cls: "bg-sky-50 text-sky-900 ring-sky-200" };
  return null;
}

export function FacilityFollowUpTaskCard({
  task,
  compact = false,
  showCancel = false,
  onComplete,
  onSnooze,
  onReschedule,
  onCancel,
  onActionDone,
}: FacilityFollowUpTaskCardProps) {
  const tel = (task.facility_phone ?? "").trim()
    ? `tel:${task.facility_phone!.replace(/[^\d+]/g, "")}`
    : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: task.facility_address,
    latitude: task.facility_latitude,
    longitude: task.facility_longitude,
  });
  const pri = priorityBadge(task.priority);
  const sourceLabel = task.source ? FOLLOW_UP_SOURCE_LABELS[task.source] : null;
  const isCompleted = task.status === "completed";
  const isCanceled = task.status === "canceled";

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        task.is_overdue && !isCompleted && !isCanceled
          ? "border-rose-300 ring-1 ring-rose-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/facilities/${task.facility_id}`}
            className="text-base font-semibold text-slate-900 hover:text-sky-800"
          >
            {task.facility_name}
          </Link>
          <p className="mt-0.5 text-sm font-medium text-slate-800">{task.title}</p>
          {!compact && task.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.description}</p>
          ) : null}
          {task.campaign_name ? (
            <p className="mt-1 rounded-lg bg-pink-50 px-2 py-1 text-xs font-semibold text-pink-900 ring-1 ring-pink-200">
              Campaign: {task.campaign_name}
              {task.campaign_step_number && task.campaign_total_steps
                ? ` · Step ${task.campaign_step_number} of ${task.campaign_total_steps}`
                : ""}
            </p>
          ) : null}
          {task.source === "packet" ? (
            <p className="mt-1 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-900 ring-1 ring-violet-200">
              Packet follow-up
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            {[task.facility_type, task.facility_city].filter(Boolean).join(" · ")}
            {task.contact_name ? ` · ${task.contact_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {task.is_overdue && !isCompleted && !isCanceled ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-900 ring-1 ring-rose-200">
              Overdue
            </span>
          ) : null}
          {task.is_due_today && !task.is_overdue && !isCompleted && !isCanceled ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900 ring-1 ring-amber-200">
              Due today
            </span>
          ) : null}
          {pri ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${pri.cls}`}>
              {pri.label}
            </span>
          ) : null}
          {sourceLabel ? (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900 ring-1 ring-violet-200">
              {sourceLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>
          Due:{" "}
          <span className="font-semibold text-slate-800">
            {formatFacilityDate(task.effective_due_at)}
          </span>
        </span>
        {task.assigned_to_label ? <span>Rep: {task.assigned_to_label}</span> : null}
        {isCompleted && task.completed_at ? (
          <span className="text-emerald-700">Completed {formatFacilityDate(task.completed_at)}</span>
        ) : null}
        {task.status === "snoozed" && task.snoozed_until ? (
          <span className="text-slate-500">Snoozed until {formatFacilityDate(task.snoozed_until)}</span>
        ) : null}
      </div>

      {!isCompleted && !isCanceled ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {onComplete ? (
            <button
              type="button"
              onClick={() => onComplete(task)}
              className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}
            >
              Complete
            </button>
          ) : null}
          {onSnooze ? (
            <button
              type="button"
              onClick={() => onSnooze(task)}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            >
              Snooze
            </button>
          ) : null}
          {onReschedule ? (
            <button
              type="button"
              onClick={() => onReschedule(task)}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            >
              Reschedule
            </button>
          ) : null}
          {showCancel && onCancel ? (
            <button
              type="button"
              onClick={() => onCancel(task)}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-rose-800`}
            >
              Cancel
            </button>
          ) : null}
          {tel ? (
            <a href={tel} className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}>
              Call
            </a>
          ) : (
            <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed opacity-50`}>
              Call
            </span>
          )}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            >
              Directions
            </a>
          ) : (
            <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed opacity-50`}>
              Directions
            </span>
          )}
          <FacilityQuickLogButton
            facilityId={task.facility_id}
            facilityName={task.facility_name}
            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            onSaved={onActionDone}
          />
          <FacilityAiCaptureButton
            facilityId={task.facility_id}
            facilityName={task.facility_name}
            sourceContext="facility_detail"
            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
            onSaved={onActionDone}
          />
          <Link
            href={`/admin/facilities/${task.facility_id}`}
            className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}
          >
            Open Facility
          </Link>
        </div>
      ) : null}
    </article>
  );
}
