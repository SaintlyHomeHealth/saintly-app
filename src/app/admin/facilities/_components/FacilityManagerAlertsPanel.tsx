"use client";

import Link from "next/link";

import type { FacilityManagerAlertRow } from "@/lib/crm/facility-notification-types";

import { facilityNotificationSeverityClass } from "@/app/admin/facilities/_components/facility-notification-ui";

type FacilityManagerAlertsPanelProps = {
  alerts: FacilityManagerAlertRow[];
  loading?: boolean;
};

export function FacilityManagerAlertsPanel({ alerts, loading }: FacilityManagerAlertsPanelProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Loading manager alerts…</p>
      </section>
    );
  }

  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-900">Manager Alerts</h2>
        <p className="mt-2 text-sm text-indigo-800">No manager-level outreach issues detected.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Manager Alerts</h2>
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.key}
            className={`rounded-xl border p-4 shadow-sm ${facilityNotificationSeverityClass(alert.severity)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm opacity-90">{alert.message}</p>
              </div>
              {alert.action_url ? (
                <Link
                  href={alert.action_url}
                  className="shrink-0 rounded-lg border border-current/20 bg-white/80 px-3 py-2 text-xs font-semibold hover:bg-white"
                >
                  Open
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
