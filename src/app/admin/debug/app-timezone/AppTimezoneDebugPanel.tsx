"use client";

import { useMemo } from "react";

import { APP_TIME_ZONE, formatAppDateTime } from "@/lib/datetime/app-timezone";

function browserLocalLabel(now: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(now);
}

type Props = { dbSampleUpdatedAt: string | null };

export function AppTimezoneDebugPanel({ dbSampleUpdatedAt }: Props) {
  const now = useMemo(() => new Date(), []);

  const rows: { label: string; value: string }[] = [
    { label: "Browser local (device)", value: browserLocalLabel(now) },
    { label: `Agency (${APP_TIME_ZONE})`, value: formatAppDateTime(now, "—", { dateStyle: "medium", timeStyle: "long" }) },
    { label: "UTC (ISO instant)", value: now.toISOString() },
    {
      label: "Sample DB `leads.updated_at` (UTC stored → Phoenix display)",
      value: dbSampleUpdatedAt ? `${formatAppDateTime(dbSampleUpdatedAt)} · raw ${dbSampleUpdatedAt}` : "No lead row returned",
    },
  ];

  return (
    <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500">
        All business-facing timestamps in the app should match the Phoenix row. Database
        columns stay UTC; this panel is for quick verification after deploy or on a new device.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="border-b border-slate-100 pb-3 last:border-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{r.label}</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-900">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
