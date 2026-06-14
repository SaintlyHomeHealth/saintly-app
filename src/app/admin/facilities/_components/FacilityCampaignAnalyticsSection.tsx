"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CampaignAnalyticsSummary } from "@/lib/crm/facility-playbook-types";

export function FacilityCampaignAnalyticsSection() {
  const [analytics, setAnalytics] = useState<CampaignAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/facilities/campaigns/analytics");
        const data = (await res.json()) as { ok: boolean; analytics?: CampaignAnalyticsSummary };
        if (data.ok) setAnalytics(data.analytics ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Loading campaign performance…</p>
      </section>
    );
  }

  if (!analytics) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Campaign Performance</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Active campaigns", value: analytics.active_campaigns },
          { label: "Facilities enrolled", value: analytics.facilities_enrolled },
          { label: "Steps completed", value: analytics.steps_completed },
          { label: "Steps overdue", value: analytics.steps_overdue },
          { label: "Referrals", value: analytics.referrals_generated },
          { label: "Converted", value: analytics.converted_referrals },
          {
            label: "Conversion rate",
            value: analytics.conversion_rate_pct != null ? `${analytics.conversion_rate_pct}%` : "—",
          },
          { label: "Best campaign", value: analytics.best_campaign_name ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {analytics.campaigns.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Playbook</th>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Enrolled</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Referrals</th>
                <th className="px-3 py-2">Converted</th>
                <th className="px-3 py-2">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {analytics.campaigns.map((row) => (
                <tr key={row.campaign_id} className="border-b border-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/facilities/campaigns/${row.campaign_id}`} className="font-semibold text-sky-800 hover:underline">
                      {row.campaign_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.playbook_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.rep_label ?? "—"}</td>
                  <td className="px-3 py-2">{row.facilities_enrolled}</td>
                  <td className="px-3 py-2">{row.progress_pct}%</td>
                  <td className="px-3 py-2">{row.referrals_created}</td>
                  <td className="px-3 py-2">{row.converted_patients}</td>
                  <td className="px-3 py-2">{row.steps_overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
