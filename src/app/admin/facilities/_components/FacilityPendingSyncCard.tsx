"use client";

import Link from "next/link";

import { formatOfflineTypeLabel } from "@/lib/crm/facility-offline-route-helpers";
import type { OfflineQueueItem } from "@/lib/crm/facility-offline-queue";

type FacilityPendingSyncCardProps = {
  item: OfflineQueueItem;
  onRetry: (localId: string) => void;
  onEdit: (item: OfflineQueueItem) => void;
  onDelete: (localId: string) => void;
  retrying?: boolean;
};

function statusBadge(status: OfflineQueueItem["status"]): { label: string; cls: string } {
  switch (status) {
    case "syncing":
      return { label: "Syncing", cls: "bg-sky-100 text-sky-900" };
    case "failed":
      return { label: "Failed", cls: "bg-red-100 text-red-900" };
    case "pending":
      return { label: "Pending", cls: "bg-violet-100 text-violet-900" };
    default:
      return { label: status, cls: "bg-slate-100 text-slate-700" };
  }
}

export function FacilityPendingSyncCard({
  item,
  onRetry,
  onEdit,
  onDelete,
  retrying = false,
}: FacilityPendingSyncCardProps) {
  const badge = statusBadge(item.status);
  const created = new Date(item.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-slate-400">{formatOfflineTypeLabel(item.type)}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.label ?? item.facility_name ?? "Field action"}</p>
          {item.facility_name && item.label !== item.facility_name ? (
            <p className="text-xs text-slate-600">{item.facility_name}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">{created}</p>
          {item.last_error ? <p className="mt-1 text-xs text-red-700">{item.last_error}</p> : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(item.status === "pending" || item.status === "failed") && item.type !== "ai_capture_note" ? (
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetry(item.local_id)}
            className="rounded-xl border border-sky-600 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : null}
        {item.type === "ai_capture_note" ? (
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded-xl border border-violet-600 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900"
          >
            Analyze
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(item.local_id)}
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
        >
          Delete
        </button>
        {item.related_facility_id ? (
          <Link
            href={`/admin/facilities/${item.related_facility_id}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
          >
            Open Facility
          </Link>
        ) : null}
        {item.related_route_id && item.related_stop_id ? (
          <Link
            href={`/admin/facilities/routes/${item.related_route_id}`}
            className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900"
          >
            Open Route Stop
          </Link>
        ) : null}
      </div>
    </article>
  );
}
