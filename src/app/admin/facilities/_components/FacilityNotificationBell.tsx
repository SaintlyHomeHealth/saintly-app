"use client";

import { useState } from "react";

import { FacilityNotificationDropdown } from "@/app/admin/facilities/_components/FacilityNotificationDropdown";
import { useFacilityNotifications } from "@/app/admin/facilities/_components/useFacilityNotifications";

type FacilityNotificationBellProps = {
  className?: string;
};

export function FacilityNotificationBell({ className }: FacilityNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { summary } = useFacilityNotifications({ autoGenerate: true, pollMs: 120_000 });

  const badge = summary.unread;
  const urgent = summary.urgent > 0;

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-[20px] border px-3 py-2 text-xs font-semibold shadow-sm transition sm:text-sm ${
          urgent
            ? "border-rose-400 bg-rose-50 text-rose-950 hover:bg-rose-100"
            : "border-slate-300 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60"
        }`}
        aria-expanded={open}
        aria-label={`Notifications${badge > 0 ? `, ${badge} unread` : ""}`}
      >
        <span aria-hidden className="text-base leading-none">
          🔔
        </span>
        <span className="hidden sm:inline">Alerts</span>
        {badge > 0 ? (
          <span
            className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
              urgent ? "bg-rose-600" : "bg-sky-600"
            }`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>
      <FacilityNotificationDropdown open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
