"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { OutreachRecentActivity, OutreachSectionPage } from "@/lib/crm/facility-outreach-types";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { trackOutreachApiCall } from "@/lib/perf/outreach-dev-perf";

import { OutreachSectionSkeleton } from "./OutreachLazySection";
import { OUTREACH_PAGE_SIZE } from "./useOutreachSection";

const sectionTitle = "text-sm font-bold uppercase tracking-wide text-slate-500";

type RecentResponse = {
  ok: boolean;
  data?: OutreachSectionPage<OutreachRecentActivity>;
};

export function OutreachRecentActivitySection() {
  const [items, setItems] = useState<OutreachRecentActivity[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/facilities/outreach-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "section",
          section: "recent_activity",
          offset,
          limit: OUTREACH_PAGE_SIZE,
        }),
      });
      const json = (await res.json()) as RecentResponse;
      trackOutreachApiCall("section:recent_activity", Date.now() - t0, json.data?.items.length ?? 0);
      if (json.ok && json.data) {
        setItems((prev) => (append ? [...prev, ...json.data!.items] : json.data!.items));
        setHasMore(json.data.has_more);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  return (
    <section className="space-y-3">
      <h2 className={sectionTitle}>Recent Activity</h2>
      {loading ? <OutreachSectionSkeleton rows={3} /> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          No recent activity logged yet.
        </p>
      ) : null}
      {items.map((a) => (
        <article key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={`/admin/facilities/${a.facilityId}`} className="font-semibold text-sky-900 hover:underline">
                {a.facilityName}
              </Link>
              <p className="mt-1 text-sm text-slate-700">
                {[a.activityType, a.outcome].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-slate-500">{formatFacilityDateTime(a.activityAt)}</p>
            </div>
            {a.photoCount > 0 ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                {a.photoCount} photo{a.photoCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {a.notes ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{a.notes}</p> : null}
          {a.nextFollowUpAt ? (
            <p className="mt-1 text-xs font-medium text-sky-800">
              Follow-up: {formatFacilityDate(a.nextFollowUpAt)}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/facilities/${a.facilityId}`} className={crmActionBtnSky}>
              Open Facility
            </Link>
            <FacilityQuickLogButton facilityId={a.facilityId} facilityName={a.facilityName} className={crmActionBtnMuted}>
              Add Follow-Up
            </FacilityQuickLogButton>
          </div>
        </article>
      ))}
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadPage(items.length, true)}
          className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more activity"}
        </button>
      ) : null}
    </section>
  );
}
