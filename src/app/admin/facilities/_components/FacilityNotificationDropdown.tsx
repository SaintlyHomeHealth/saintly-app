"use client";

import { useEffect, useRef } from "react";

import { FacilityNotificationList } from "@/app/admin/facilities/_components/FacilityNotificationList";
import type { FacilityNotificationsState } from "@/app/admin/facilities/_components/useFacilityNotificationsState";

type FacilityNotificationDropdownProps = {
  open: boolean;
  onClose: () => void;
  state: FacilityNotificationsState;
};

export function FacilityNotificationDropdown({ open, onClose, state }: FacilityNotificationDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, summary, loading, markRead, dismiss, refresh } = state;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-label="Facility notifications"
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Outreach alerts</h3>
          <p className="text-xs text-slate-500">
            {summary.unread} unread
            {summary.urgent > 0 ? ` · ${summary.urgent} urgent` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      <div className="max-h-[min(24rem,70vh)] overflow-y-auto p-3">
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <FacilityNotificationList
            notifications={notifications}
            onRead={markRead}
            onDismiss={dismiss}
            compact
            maxItems={20}
          />
        )}
      </div>
    </div>
  );
}
