"use client";

import Link from "next/link";

import type { FacilityNotificationSeverity } from "@/lib/crm/facility-notification-types";

import { facilityNotificationSeverityClass } from "@/app/admin/facilities/_components/facility-notification-ui";

export type FacilityAlertBannerItem = {
  key: string;
  title: string;
  message?: string;
  severity?: FacilityNotificationSeverity;
  actionUrl?: string;
  actionLabel?: string;
};

type FacilityAlertBannerProps = {
  items: FacilityAlertBannerItem[];
  title?: string;
};

export function FacilityAlertBanner({ items, title = "Needs attention" }: FacilityAlertBannerProps) {
  if (items.length === 0) return null;

  const topSeverity = items.some((i) => i.severity === "urgent")
    ? "urgent"
    : items.some((i) => i.severity === "warning")
      ? "warning"
      : "info";

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${facilityNotificationSeverityClass(topSeverity)}`}
      aria-label={title}
    >
      <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-white/50 bg-white/50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.message ? <p className="mt-0.5 text-xs opacity-90">{item.message}</p> : null}
            </div>
            {item.actionUrl ? (
              <Link
                href={item.actionUrl}
                className="shrink-0 rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white"
              >
                {item.actionLabel ?? "View"}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
