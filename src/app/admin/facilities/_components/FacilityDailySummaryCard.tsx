"use client";

import Link from "next/link";

import type { FacilityDailyAlertSummary } from "@/lib/crm/facility-notification-types";

type FacilityDailySummaryCardProps = {
  summary: FacilityDailyAlertSummary | null;
  routeUnfinishedCount?: number;
  loading?: boolean;
};

export function FacilityDailySummaryCard({
  summary,
  routeUnfinishedCount = 0,
  loading,
}: FacilityDailySummaryCardProps) {
  const items: { label: string; count: number; severity: "normal" | "warn" }[] = [];

  if (summary) {
    if (summary.followUpsDueToday > 0) {
      items.push({ label: "follow-ups due today", count: summary.followUpsDueToday, severity: "normal" });
    }
    if (summary.followUpsOverdue > 0) {
      items.push({ label: "overdue follow-ups", count: summary.followUpsOverdue, severity: "warn" });
    }
    if (summary.newReferrals > 0) {
      items.push({ label: "new referrals", count: summary.newReferrals, severity: "normal" });
    }
    if (summary.referralsWaitingOrders > 0) {
      items.push({ label: "referral waiting on orders", count: summary.referralsWaitingOrders, severity: "warn" });
    }
    if (summary.referralsStuck > 0) {
      items.push({ label: "stuck referral", count: summary.referralsStuck, severity: "warn" });
    }
    if (summary.warmSourcesNeedFollowUp > 0) {
      items.push({ label: "warm source needs follow-up", count: summary.warmSourcesNeedFollowUp, severity: "warn" });
    }
  }

  if (routeUnfinishedCount > 0) {
    items.push({
      label: "route stop not visited or skipped",
      count: routeUnfinishedCount,
      severity: "warn",
    });
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Loading today&apos;s priority alerts…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-900">Today&apos;s Priority Alerts</h2>
        <p className="mt-2 text-sm text-emerald-800">You&apos;re caught up — no urgent outreach items right now.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-amber-950">Today&apos;s Priority Alerts</h2>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-baseline gap-2 text-sm text-amber-950">
            <span className={`text-lg font-bold ${item.severity === "warn" ? "text-rose-700" : "text-amber-800"}`}>
              {item.count}
            </span>
            <span>
              {item.label}
              {item.count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/facilities/follow-ups"
          className="inline-flex min-h-[2.5rem] items-center rounded-xl border border-amber-700 bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          View Follow-Ups
        </Link>
        <Link
          href="/admin/facilities/referrals"
          className="inline-flex min-h-[2.5rem] items-center rounded-xl border border-violet-600 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
        >
          View Facility Referrals
        </Link>
        <Link
          href="/admin/facilities/route-builder"
          className="inline-flex min-h-[2.5rem] items-center rounded-xl border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-100"
        >
          Build Route
        </Link>
      </div>
    </section>
  );
}
