"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityEnrollCampaignModal } from "@/app/admin/facilities/_components/FacilityEnrollCampaignModal";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityManagerAlertsPanel } from "@/app/admin/facilities/_components/FacilityManagerAlertsPanel";
import { FacilityCampaignAnalyticsSection } from "@/app/admin/facilities/_components/FacilityCampaignAnalyticsSection";
import { FacilityCreateFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityCreateFollowUpTaskModal";
import { FacilityFollowUpTaskCard } from "@/app/admin/facilities/_components/FacilityFollowUpTaskCard";
import { FacilityFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityFollowUpTaskModal";
import { FacilityNewReferralButton } from "@/app/admin/facilities/_components/FacilityNewReferralButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { FacilityAnalyticsResponse } from "@/app/api/facilities/analytics/route";
import type { FacilityAnalyticsData } from "@/lib/crm/facility-analytics-types";
import type { FollowUpTaskCard } from "@/lib/crm/facility-follow-up-task-types";
import { FOLLOW_UP_SOURCE_LABELS } from "@/lib/crm/facility-follow-up-task-types";
import type { FollowUpTaskActionMode } from "@/lib/crm/facility-follow-up-task-client";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { facilityPhotoTypeLabel } from "@/lib/crm/facility-photos-constants";
import { facilityPhotoFileUrl } from "@/lib/crm/facility-photo-client";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import {
  addFacilityToRouteDraft,
  notifyRouteDraftChanged,
} from "@/lib/crm/facility-route-draft";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { useFacilityNotifications } from "@/app/admin/facilities/_components/useFacilityNotifications";

type DatePreset = "today" | "7d" | "30d" | "90d" | "custom";

type FacilityAnalyticsViewProps = {
  canFilterReps: boolean;
};

const sectionTitle = "text-sm font-bold uppercase tracking-wide text-slate-500";

function SummaryChange({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${positive ? "text-emerald-700" : "text-rose-700"}`}>
      {positive ? "+" : ""}
      {pct}% vs prior period
    </span>
  );
}

function taskToCard(t: FacilityAnalyticsData["followUpDiscipline"]["recentTasks"][number]): FollowUpTaskCard {
  const today = getCrmCalendarTodayIso();
  const dueYmd = t.dueAt.slice(0, 10);
  return {
    id: t.id,
    facility_id: t.facilityId,
    activity_id: null,
    contact_id: null,
    assigned_to: null,
    title: t.title,
    description: null,
    due_at: t.dueAt,
    status: t.status as FollowUpTaskCard["status"],
    priority: null,
    source: (t.source as FollowUpTaskCard["source"]) ?? null,
    completed_at: null,
    completed_by: null,
    completion_note: null,
    snoozed_until: null,
    created_by: null,
    created_at: t.dueAt,
    updated_at: t.dueAt,
    facility_name: t.facilityName,
    facility_city: null,
    facility_type: null,
    facility_phone: null,
    facility_address: "",
    facility_latitude: null,
    facility_longitude: null,
    contact_name: null,
    assigned_to_label: t.assignedRepLabel,
    is_overdue: dueYmd < today && t.status === "open",
    is_due_today: dueYmd === today && t.status === "open",
    effective_due_at: t.dueAt,
  };
}

export function FacilityAnalyticsView({ canFilterReps }: FacilityAnalyticsViewProps) {
  const today = getCrmCalendarTodayIso();
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [startDate, setStartDate] = useState(addCalendarDaysToIsoDate(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [repId, setRepId] = useState("");
  const [city, setCity] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [source, setSource] = useState("");
  const [data, setData] = useState<FacilityAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null);
  const [createTaskFacility, setCreateTaskFacility] = useState<{ id: string; name: string } | null>(null);
  const [enrollFacility, setEnrollFacility] = useState<{ id: string; name: string } | null>(null);
  const [taskModal, setTaskModal] = useState<{ mode: FollowUpTaskActionMode; task: FollowUpTaskCard } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { managerAlerts, loading: managerAlertsLoading } = useFacilityNotifications({
    autoGenerate: canFilterReps,
  });

  function applyPreset(p: DatePreset) {
    setPreset(p);
    if (p === "today") {
      setStartDate(today);
      setEndDate(today);
    } else if (p === "7d") {
      setStartDate(addCalendarDaysToIsoDate(today, -6));
      setEndDate(today);
    } else if (p === "30d") {
      setStartDate(addCalendarDaysToIsoDate(today, -29));
      setEndDate(today);
    } else if (p === "90d") {
      setStartDate(addCalendarDaysToIsoDate(today, -89));
      setEndDate(today);
    }
  }

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("start_date", startDate);
    p.set("end_date", endDate);
    if (repId) p.set("rep_id", repId);
    if (city) p.set("city", city);
    if (facilityType) p.set("facility_type", facilityType);
    if (source) p.set("source", source);
    return p.toString();
  }, [startDate, endDate, repId, city, facilityType, source]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/analytics?${queryString}`);
      const json = (await res.json()) as FacilityAnalyticsResponse;
      if (!json.ok) {
        setError("Could not load analytics.");
        setData(null);
        return;
      }
      setData(json.data);
    } catch {
      setError("Network error loading analytics.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    applyPreset("30d");
    setRepId("");
    setCity("");
    setFacilityType("");
    setSource("");
  }

  function exportCsv() {
    window.location.href = `/api/facilities/analytics/export?${queryString}`;
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
    void load();
  }

  const maxTrend = Math.max(
    1,
    ...(data?.activityTrend.map((t) => Math.max(t.activities, t.inPersonVisits, t.materialsDropped)) ?? [1])
  );

  return (
    <div className="space-y-8 pb-12">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {canFilterReps ? (
        <FacilityManagerAlertsPanel alerts={managerAlerts} loading={managerAlertsLoading} />
      ) : null}

      {canFilterReps ? <FacilityCampaignAnalyticsSection /> : null}

      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["90d", "90 days"],
              ["custom", "Custom"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                preset === id
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={exportCsv}
            className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-indigo-300"
          >
            Export CSV
          </button>
        </div>

        {preset === "custom" ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="text-xs font-medium text-slate-600">
              Start
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${crmFilterInputCls} ml-1`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              End
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${crmFilterInputCls} ml-1`}
              />
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-3">
          {canFilterReps ? (
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Rep
              <select value={repId} onChange={(e) => setRepId(e.target.value)} className={crmFilterInputCls}>
                <option value="">All reps</option>
                {(data?.filterOptions.reps ?? []).map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            City
            <select value={city} onChange={(e) => setCity(e.target.value)} className={crmFilterInputCls}>
              <option value="">All</option>
              {(data?.filterOptions.cities ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Type
            <select
              value={facilityType}
              onChange={(e) => setFacilityType(e.target.value)}
              className={crmFilterInputCls}
            >
              <option value="">All</option>
              {(data?.filterOptions.types ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)} className={crmFilterInputCls}>
              <option value="">All</option>
              <option value="google_places">Google Places</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading analytics…</p> : null}
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
      ) : null}

      {!loading && data ? (
        <>
          <section>
            <h2 className={sectionTitle}>Summary</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {data.summary.map((c) => (
                <div key={c.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
                  <SummaryChange pct={c.changePct} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>Agent performance</h2>
            {!data.agentPerformance.length ? (
              <p className="mt-2 text-sm text-slate-500">No activity in this date range.</p>
            ) : (
              <>
                <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Rep</th>
                        <th className="px-3 py-2">Activities</th>
                        <th className="px-3 py-2">In-person</th>
                        <th className="px-3 py-2">Calls</th>
                        <th className="px-3 py-2">AI</th>
                        <th className="px-3 py-2">Photos</th>
                        <th className="px-3 py-2">Visited</th>
                        <th className="px-3 py-2">FU done</th>
                        <th className="px-3 py-2">Overdue</th>
                        <th className="px-3 py-2">Routes</th>
                        <th className="px-3 py-2">Route stops</th>
                        <th className="px-3 py-2">Route %</th>
                        <th className="px-3 py-2">Last activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.agentPerformance.map((r) => (
                        <tr key={r.repUserId}>
                          <td className="px-3 py-2 font-medium">{r.repLabel}</td>
                          <td className="px-3 py-2">{r.totalActivities}</td>
                          <td className="px-3 py-2">{r.inPersonVisits}</td>
                          <td className="px-3 py-2">{r.phoneCalls}</td>
                          <td className="px-3 py-2">{r.aiCaptures}</td>
                          <td className="px-3 py-2">{r.photoNotes}</td>
                          <td className="px-3 py-2">{r.facilitiesVisited}</td>
                          <td className="px-3 py-2">{r.followUpsCompleted}</td>
                          <td className="px-3 py-2">{r.overdueFollowUps}</td>
                          <td className="px-3 py-2">{r.routesCompleted}</td>
                          <td className="px-3 py-2">{r.routeStopsCompleted}</td>
                          <td className="px-3 py-2">{r.routeCompletionRate != null ? `${r.routeCompletionRate}%` : "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {r.lastActivityAt ? formatFacilityDate(r.lastActivityAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-3 md:hidden">
                  {data.agentPerformance.map((r) => (
                    <article key={r.repUserId} className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="font-semibold text-slate-900">{r.repLabel}</h3>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <div>Activities: {r.totalActivities}</div>
                        <div>In-person: {r.inPersonVisits}</div>
                        <div>Calls: {r.phoneCalls}</div>
                        <div>Photos: {r.photoNotes}</div>
                        <div>FU completed: {r.followUpsCompleted}</div>
                        <div>Overdue: {r.overdueFollowUps}</div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Activity trend</h2>
            {data.activityTrend.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No trend data.</p>
            ) : (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                {data.activityTrend.map((t) => (
                  <div key={t.date} className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs">
                    <span className="font-medium text-slate-600">{t.date.slice(5)}</span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded bg-sky-500"
                          style={{ width: `${Math.max(4, (t.activities / maxTrend) * 100)}%` }}
                        />
                        <span>{t.activities} activities</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <div
                          className="h-1.5 rounded bg-emerald-500"
                          style={{ width: `${Math.max(4, (t.inPersonVisits / maxTrend) * 100)}%` }}
                        />
                        <span>{t.inPersonVisits} in-person</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Referral source review</h2>
            {data.sourceReview.pending > 0 ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {data.sourceReview.pending} referral source{data.sourceReview.pending === 1 ? "" : "s"} need review.{" "}
                <Link href="/admin/facilities/source-review" className="font-semibold text-amber-900 underline">
                  Open Source Review
                </Link>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Needs review", data.sourceReview.pending],
                ["Reviews completed", data.sourceReview.reviewed],
                ["Matched after review", data.sourceReview.matchedAfterReview],
                ["Facilities created", data.sourceReview.facilitiesCreatedFromReview],
                ["Avg hrs to review", data.sourceReview.avgHoursToReview ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-800">{label}</p>
                  <p className="mt-1 text-xl font-bold text-amber-950">{value}</p>
                </div>
              ))}
            </div>
            {data.sourceReview.topUnmatchedOfficeNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.sourceReview.topUnmatchedOfficeNames.map((o) => (
                  <span key={o.name} className="rounded-full bg-white px-2 py-1 text-xs font-semibold ring-1 ring-amber-200">
                    {o.name}: {o.count}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <h2 className={sectionTitle}>Top producing referral sources</h2>
            {!data.referralAttribution.topProducingSources.length ? (
              <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                No CRM referral leads linked to facilities in this date range.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Facility</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">City</th>
                      <th className="px-3 py-2">Leads</th>
                      <th className="px-3 py-2">Converted</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Last referral</th>
                      <th className="px-3 py-2">Rep</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.referralAttribution.topProducingSources.map((row) => (
                      <tr key={row.facilityId} className="bg-white/80">
                        <td className="px-3 py-2 font-medium text-slate-900">{row.facilityName}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{row.facilityType ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{row.city ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{row.leads}</td>
                        <td className="px-3 py-2 tabular-nums">{row.converted}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.conversionRate != null ? `${row.conversionRate}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {row.lastReferralAt ? formatFacilityDate(row.lastReferralAt) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{row.assignedRepLabel ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link href={`/admin/facilities/${row.facilityId}`} className="text-xs font-semibold text-sky-700 hover:underline">
                              Open Facility
                            </Link>
                            <FacilityNewReferralButton
                              facilityId={row.facilityId}
                              facilityName={row.facilityName}
                              className="text-xs font-semibold text-emerald-800 hover:underline"
                              onCreated={() => void load()}
                            >
                              New Referral
                            </FacilityNewReferralButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.referralProfileIntelligence ? (
            <section>
              <h2 className={sectionTitle}>Referral Source Intelligence</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Referral process captured", value: data.referralProfileIntelligence.summary.with_referral_process },
                  { label: "Best contact identified", value: data.referralProfileIntelligence.summary.with_best_contact },
                  { label: "Preferred method set", value: data.referralProfileIntelligence.summary.with_preferred_method },
                  { label: "Warm / Hot profiles", value: data.referralProfileIntelligence.summary.warm_hot_count },
                  { label: "Active producers", value: data.referralProfileIntelligence.summary.active_producer_count },
                  { label: "Missing profile", value: data.referralProfileIntelligence.summary.missing_profile_count },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase text-violet-800">{c.label}</p>
                    <p className="mt-1 text-2xl font-bold text-violet-950">{c.value}</p>
                  </div>
                ))}
              </div>
              {data.referralProfileIntelligence.rows.length ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Facility</th>
                        <th className="px-3 py-2">Complete</th>
                        <th className="px-3 py-2">Potential</th>
                        <th className="px-3 py-2">Best contact</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2">Next action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.referralProfileIntelligence.rows.slice(0, 15).map((row) => (
                        <tr key={row.facility_id}>
                          <td className="px-3 py-2">
                            <Link href={`/admin/facilities/${row.facility_id}`} className="font-semibold text-sky-800 hover:underline">
                              {row.facility_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{row.completeness_pct}%</td>
                          <td className="px-3 py-2">{row.referral_potential ?? "—"}</td>
                          <td className="px-3 py-2">{row.best_contact_name ?? "—"}</td>
                          <td className="px-3 py-2">{row.preferred_method ?? "—"}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{row.next_best_action ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {data.intakeReadiness ? (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={sectionTitle}>Intake readiness</h2>
                <Link
                  href="/admin/facilities/referrals"
                  className="text-sm font-semibold text-teal-800 hover:underline"
                >
                  Open referrals
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { label: "New referrals", value: data.intakeReadiness.newReferrals },
                  { label: "Ready", value: data.intakeReadiness.readyReferrals },
                  { label: "Needs info", value: data.intakeReadiness.needsInfo },
                  { label: "Needs payer review", value: data.intakeReadiness.needsPayerReview },
                  { label: "Needs clinical review", value: data.intakeReadiness.needsClinicalReview },
                  { label: "Accepted", value: data.intakeReadiness.accepted },
                  { label: "Declined", value: data.intakeReadiness.declined },
                  {
                    label: "Avg readiness score",
                    value: data.intakeReadiness.averageReadinessScore ?? "—",
                  },
                  {
                    label: "Avg hrs to accept",
                    value: data.intakeReadiness.averageHoursToAcceptance ?? "—",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-teal-100 bg-teal-50/30 p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-teal-800/70">{m.label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{m.value}</p>
                  </div>
                ))}
              </div>
              {data.intakeReadiness.topMissingItems.length > 0 ? (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top missing items</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {data.intakeReadiness.topMissingItems.map((row) => (
                      <li key={row.item}>
                        {row.item} <span className="text-slate-500">({row.count})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {data.admissionHandoff ? (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={sectionTitle}>Admission handoffs</h2>
                <Link
                  href="/admin/intake/admissions"
                  className="text-sm font-semibold text-indigo-800 hover:underline"
                >
                  Open handoffs
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { label: "Handoffs created", value: data.admissionHandoff.handoffsCreated },
                  { label: "Ready for SOC", value: data.admissionHandoff.readyForSoc },
                  { label: "Scheduled SOC", value: data.admissionHandoff.scheduledSoc },
                  { label: "Admitted", value: data.admissionHandoff.admitted },
                  { label: "On hold", value: data.admissionHandoff.onHold },
                  {
                    label: "Avg hrs to ready",
                    value: data.admissionHandoff.avgHoursAcceptedToReady ?? "—",
                  },
                  {
                    label: "Avg hrs to scheduled",
                    value: data.admissionHandoff.avgHoursAcceptedToScheduled ?? "—",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800/70">{m.label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{m.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>Referral pipeline health</h2>
              <Link
                href="/admin/facilities/referrals"
                className="text-sm font-semibold text-violet-800 hover:underline"
              >
                Open pipeline
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {[
                { label: "Referrals created", value: data.referralPipeline.leadsCreated },
                { label: "Patient contacted", value: data.referralPipeline.contactedCount },
                { label: "Insurance verified", value: data.referralPipeline.insuranceVerifiedCount },
                { label: "Waiting on orders/F2F", value: data.referralPipeline.waitingOrdersCount },
                { label: "Ready for SOC", value: data.referralPipeline.readyForSocCount },
                { label: "Converted", value: data.referralPipeline.convertedCount },
                { label: "Lost / not eligible", value: data.referralPipeline.lostCount },
                {
                  label: "Conversion rate",
                  value:
                    data.referralPipeline.conversionRate != null
                      ? `${data.referralPipeline.conversionRate}%`
                      : "—",
                },
                {
                  label: "Avg days to convert",
                  value: data.referralPipeline.avgDaysToConversion ?? "—",
                },
                { label: "With documents", value: data.referralPipeline.referralsWithDocuments },
                { label: "Docs need review", value: data.referralPipeline.documentsNeedingReview },
                {
                  label: "Avg docs / referral",
                  value: data.referralPipeline.averageDocumentsPerReferral ?? "—",
                },
                { label: "Missing documents", value: data.referralPipeline.referralsMissingDocuments },
                { label: "AI reviewed docs", value: data.referralPipeline.documentsAiReviewed },
                { label: "AI review needed", value: data.referralPipeline.documentsAiReviewNeeded },
                { label: "Missing physician order", value: data.referralPipeline.referralsMissingPhysicianOrder },
                { label: "Missing insurance", value: data.referralPipeline.referralsMissingInsurance },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{m.value}</p>
                </div>
              ))}
            </div>

            {data.referralPipeline.pipelineHealth.some((r) => r.count > 0) ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Avg age (days)</th>
                      <th className="px-3 py-2">Oldest</th>
                      <th className="px-3 py-2">Action needed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.referralPipeline.pipelineHealth
                      .filter((r) => r.count > 0)
                      .map((row) => (
                        <tr key={row.stage_key} className="bg-white/80">
                          <td className="px-3 py-2 font-medium text-slate-900">{row.stage_label}</td>
                          <td className="px-3 py-2 tabular-nums">{row.count}</td>
                          <td className="px-3 py-2 tabular-nums">{row.average_age_days ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {row.oldest_referral_at ? formatFacilityDate(row.oldest_referral_at) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-amber-900">{row.action_needed ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No facility referrals in this date range.</p>
            )}

            {(data.referralPipeline.topFacilitiesConverted.length > 0 ||
              data.referralPipeline.topRepsConverted.length > 0) && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {data.referralPipeline.topFacilitiesConverted.length > 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Top facilities by converted patients
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {data.referralPipeline.topFacilitiesConverted.map((r) => (
                        <li key={r.facilityId} className="flex justify-between gap-2">
                          <Link href={`/admin/facilities/${r.facilityId}`} className="font-medium text-sky-800 hover:underline">
                            {r.facilityName}
                          </Link>
                          <span className="tabular-nums text-slate-700">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.referralPipeline.topRepsConverted.length > 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Top reps by converted referrals
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {data.referralPipeline.topRepsConverted.map((r) => (
                        <li key={r.repUserId} className="flex justify-between gap-2">
                          <span className="font-medium text-slate-900">{r.repLabel}</span>
                          <span className="tabular-nums text-slate-700">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Warm / hot referral sources</h2>
            {!data.warmSources.length ? (
              <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                No warm facilities in the last 90 days for current filters.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {data.warmSources.map((w) => (
                  <article key={w.facilityId} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/admin/facilities/${w.facilityId}`}
                          className="font-semibold text-slate-900 hover:text-sky-800"
                        >
                          {w.facilityName}
                        </Link>
                        <p className="text-sm text-slate-600">
                          {[w.facilityType, w.city].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Last: {w.lastActivityAt ? formatFacilityDate(w.lastActivityAt) : "—"} ·{" "}
                          {w.lastOutcome ?? "—"}
                          {w.referralPotential ? ` · ${w.referralPotential}` : ""}
                        </p>
                        {w.followUpTaskTitle ? (
                          <p className="mt-1 text-xs font-medium text-amber-900">
                            Task: {w.followUpTaskTitle}
                            {w.followUpTaskDue ? ` · due ${formatFacilityDate(w.followUpTaskDue)}` : ""}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {w.warmthReasons.map((r) => (
                            <span
                              key={r}
                              className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      {w.assignedRepLabel ? (
                        <span className="text-xs text-slate-500">Rep: {w.assignedRepLabel}</span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <Link href={`/admin/facilities/${w.facilityId}`} className={`${crmActionBtnSky} text-center`}>
                        Open
                      </Link>
                      <FacilityNewReferralButton
                        facilityId={w.facilityId}
                        facilityName={w.facilityName}
                        className={`${crmActionBtnMuted} border-emerald-200 bg-emerald-50 text-center text-emerald-900`}
                        onCreated={() => void load()}
                      >
                        New Referral
                      </FacilityNewReferralButton>
                      <FacilityQuickLogButton
                        facilityId={w.facilityId}
                        facilityName={w.facilityName}
                        className={`${crmActionBtnMuted} text-center`}
                        onSaved={() => void load()}
                      />
                      <FacilityAiCaptureButton
                        facilityId={w.facilityId}
                        facilityName={w.facilityName}
                        sourceContext="facility_detail"
                        className={`${crmActionBtnMuted} text-center text-[11px]`}
                        onSaved={() => void load()}
                      />
                      <button
                        type="button"
                        className={`${crmActionBtnMuted} text-center`}
                        onClick={() => setCreateTaskFacility({ id: w.facilityId, name: w.facilityName })}
                      >
                        Create Follow-Up
                      </button>
                      {canFilterReps ? (
                        <button
                          type="button"
                          className={`${crmActionBtnMuted} border-pink-200 bg-pink-50 text-center text-pink-900`}
                          onClick={() => setEnrollFacility({ id: w.facilityId, name: w.facilityName })}
                        >
                          Enroll in Campaign
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>At-risk / neglected facilities</h2>
            {!data.atRiskFacilities.length ? (
              <p className="mt-2 text-sm text-slate-500">No at-risk facilities for current filters.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {data.atRiskFacilities.map((f) => (
                  <article key={f.facilityId} className="rounded-xl border border-rose-200 bg-rose-50/30 p-4">
                    <Link
                      href={`/admin/facilities/${f.facilityId}`}
                      className="font-semibold text-slate-900 hover:text-sky-800"
                    >
                      {f.facilityName}
                    </Link>
                    <p className="text-sm text-rose-900">{f.reason}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Last activity: {f.lastActivityAt ? formatFacilityDate(f.lastActivityAt) : "Never"} · Rep:{" "}
                      {f.assignedRepLabel ?? "—"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        className={crmActionBtnMuted}
                        onClick={() => {
                          addFacilityToRouteDraft(f.facilityId, f.facilityName);
                          notifyRouteDraftChanged();
                          showToast("Added to route.");
                        }}
                      >
                        Add to Route
                      </button>
                      <button
                        type="button"
                        className={crmActionBtnMuted}
                        onClick={() => setCreateTaskFacility({ id: f.facilityId, name: f.facilityName })}
                      >
                        Create Follow-Up
                      </button>
                      <Link href={`/admin/facilities/${f.facilityId}`} className={`${crmActionBtnSky} text-center`}>
                        Open Facility
                      </Link>
                      {canFilterReps ? (
                        <button
                          type="button"
                          className={`${crmActionBtnMuted} border-pink-200 bg-pink-50 text-pink-900`}
                          onClick={() => setEnrollFacility({ id: f.facilityId, name: f.facilityName })}
                        >
                          Enroll in Campaign
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Materials / photo proof</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Photos", data.photoProof.photosUploaded],
                ["Business cards", data.photoProof.businessCards],
                ["Swag bags", data.photoProof.swagBags],
                ["Postcards", data.photoProof.postcards],
                ["Packet/fax", data.photoProof.packetFaxRequests],
                ["Facilities w/ photos", data.photoProof.facilitiesWithPhotos],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
            {data.photoProof.recent.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.photoProof.recent.map((p) => (
                  <article key={p.photoId} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <button
                      type="button"
                      onClick={() => setPreviewPhotoId(p.photoId)}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={facilityPhotoFileUrl(p.photoId)} alt="" className="h-full w-full object-cover" />
                    </button>
                    <div className="min-w-0">
                      <Link href={`/admin/facilities/${p.facilityId}`} className="text-sm font-semibold text-slate-900">
                        {p.facilityName}
                      </Link>
                      <p className="text-xs text-slate-600">{facilityPhotoTypeLabel(p.photoType)}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{p.aiSummary ?? "—"}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {p.uploadedByLabel ?? "—"} · {formatFacilityDate(p.uploadedAt)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <h2 className={sectionTitle}>Follow-up discipline</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Created", data.followUpDiscipline.created],
                ["Completed", data.followUpDiscipline.completed],
                ["Overdue", data.followUpDiscipline.overdue],
                ["Completion rate", data.followUpDiscipline.completionRate != null ? `${data.followUpDiscipline.completionRate}%` : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
            {data.followUpDiscipline.bySource.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Completed</th>
                      <th className="px-3 py-2">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.followUpDiscipline.bySource.map((s) => (
                      <tr key={s.source}>
                        <td className="px-3 py-2">
                          {FOLLOW_UP_SOURCE_LABELS[s.source as keyof typeof FOLLOW_UP_SOURCE_LABELS] ?? s.source}
                        </td>
                        <td className="px-3 py-2 text-center">{s.created}</td>
                        <td className="px-3 py-2 text-center">{s.completed}</td>
                        <td className="px-3 py-2 text-center">{s.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {data.followUpDiscipline.recentTasks.length > 0 ? (
              <div className="mt-4 space-y-3">
                {data.followUpDiscipline.recentTasks.slice(0, 8).map((t) => {
                  const card = taskToCard(t);
                  return (
                    <FacilityFollowUpTaskCard
                      key={t.id}
                      task={card}
                      compact
                      onComplete={(task) => setTaskModal({ mode: "complete", task })}
                      onSnooze={(task) => setTaskModal({ mode: "snooze", task })}
                      onActionDone={() => void load()}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>

          <section>
            <h2 className={sectionTitle}>Route performance</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["Routes planned", data.routePerformance.routesPlanned],
                ["Routes started", data.routePerformance.routesStarted],
                ["Routes completed", data.routePerformance.routesCompleted],
                ["Stops completed", data.routePerformance.stopsCompleted],
                ["Stops skipped", data.routePerformance.stopsSkipped],
                ["Completion rate", data.routePerformance.completionRate != null ? `${data.routePerformance.completionRate}%` : "—"],
                ["Avg stops / route", data.routePerformance.avgStopsPerRoute ?? "—"],
                ["Visits from routes", data.routePerformance.visitsLoggedFromRoute],
                ["Photo proof", data.routePerformance.photoProofFromRoute],
                ["Referrals from routes", data.routePerformance.referralsFromRoute],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase text-teal-800">{label}</p>
                  <p className="mt-1 text-xl font-bold text-teal-950">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>Packet fulfillment</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Requests created", data.packetFulfillment.requestsCreated],
                ["Pending", data.packetFulfillment.pending],
                ["Sent", data.packetFulfillment.sent],
                ["Confirmed", data.packetFulfillment.confirmedReceived],
                ["Overdue", data.packetFulfillment.overdue],
                [
                  "Avg hrs to send",
                  data.packetFulfillment.avgHoursRequestToSent ?? "—",
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase text-violet-800">{label}</p>
                  <p className="mt-1 text-xl font-bold text-violet-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Email sent", data.packetFulfillment.emailSent],
                ["Fax sent", data.packetFulfillment.faxSent],
                ["Manual sent", data.packetFulfillment.manualSent],
                ["Failed attempts", data.packetFulfillment.failedDeliveryAttempts],
                ["Avg attempts / sent", data.packetFulfillment.avgAttemptsPerSentPacket ?? "—"],
                ["No materials selected", data.packetFulfillment.packetsWithoutMaterials],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-600">{label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Packet links", data.packetFulfillment.packetLinksCreated],
                ["Link views", data.packetFulfillment.packetLinkViews],
                ["Link submissions", data.packetFulfillment.packetLinkSubmissions],
                ["Leads from links", data.packetFulfillment.packetLinkLeads],
                ["Packet→lead %", data.packetFulfillment.packetToLeadConversionRate ?? "—"],
                ["Avg days sent→referral", data.packetFulfillment.avgDaysPacketSentToReferral ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase text-teal-800">{label}</p>
                  <p className="mt-1 text-xl font-bold text-teal-950">{value}</p>
                </div>
              ))}
            </div>
            {data.packetFulfillment.topPacketMaterialsByLeads.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase text-slate-600">Top packet materials by leads</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.packetFulfillment.topPacketMaterialsByLeads.map((m) => (
                    <span key={m.materialId} className="rounded-full bg-white px-2 py-1 text-xs font-semibold ring-1 ring-teal-200">
                      {m.materialName}: {m.leads}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {data.packetFulfillment.byMaterialType.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.packetFulfillment.byMaterialType.map((m) => (
                  <span key={m.packetType} className="rounded-full bg-white px-2 py-1 text-xs font-semibold ring-1 ring-violet-200">
                    {m.label}: {m.count}
                  </span>
                ))}
              </div>
            ) : null}
            {data.packetFulfillment.facilities.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Facility</th>
                      <th className="px-3 py-2">Requests</th>
                      <th className="px-3 py-2">Sent</th>
                      <th className="px-3 py-2">Confirmed</th>
                      <th className="px-3 py-2">Referrals after</th>
                      <th className="px-3 py-2">Last sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.packetFulfillment.facilities.slice(0, 15).map((f) => (
                      <tr key={f.facilityId}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/facilities/${f.facilityId}`} className="font-medium text-sky-800 hover:underline">
                            {f.facilityName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">{f.requests}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{f.sent}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{f.confirmed}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{f.referralsAfterPacket}</td>
                        <td className="px-3 py-2 text-center text-xs">
                          {f.lastPacketSentAt ? formatFacilityDate(f.lastPacketSentAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section>
            <h2 className={sectionTitle}>Facility growth</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Total", data.facilityGrowth.totalFacilities],
                ["Google import", data.facilityGrowth.importedFromGoogle],
                ["Manual", data.facilityGrowth.manuallyAdded],
                ["No activity", data.facilityGrowth.noActivity],
                ["With coords", data.facilityGrowth.withCoordinates],
                ["With contacts", data.facilityGrowth.withContacts],
                ["With photos", data.facilityGrowth.withPhotos],
                ["With tasks", data.facilityGrowth.withFollowUpTasks],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
            {data.facilityGrowth.newInRange.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Facility</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Added by</th>
                      <th className="px-3 py-2">Added</th>
                      <th className="px-3 py-2">First activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.facilityGrowth.newInRange.map((f) => (
                      <tr key={f.facilityId}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/facilities/${f.facilityId}`} className="font-medium text-sky-800">
                            {f.facilityName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{f.source}</td>
                        <td className="px-3 py-2">{f.addedByLabel ?? "—"}</td>
                        <td className="px-3 py-2">{formatFacilityDate(f.addedAt)}</td>
                        <td className="px-3 py-2">{f.firstActivityStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className={sectionTitle}>By facility type</h2>
              <BreakdownTable rows={data.breakdowns.byType} />
            </div>
            <div>
              <h2 className={sectionTitle}>By city</h2>
              <BreakdownTable rows={data.breakdowns.byCity} />
            </div>
          </section>
        </>
      ) : null}

      {previewPhotoId ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close preview"
            onClick={() => setPreviewPhotoId(null)}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={facilityPhotoFileUrl(previewPhotoId)}
            alt=""
            className="relative max-h-[90vh] max-w-full rounded-lg shadow-xl"
          />
        </div>
      ) : null}

      <FacilityCreateFollowUpTaskModal
        open={Boolean(createTaskFacility)}
        facilityId={createTaskFacility?.id ?? ""}
        facilityName={createTaskFacility?.name ?? ""}
        onClose={() => setCreateTaskFacility(null)}
        onCreated={() => void load()}
        onToast={showToast}
      />

      <FacilityFollowUpTaskModal
        open={Boolean(taskModal)}
        mode={taskModal?.mode ?? "complete"}
        task={taskModal?.task ?? null}
        onClose={() => setTaskModal(null)}
        onDone={showToast}
      />

      {canFilterReps && enrollFacility ? (
        <FacilityEnrollCampaignModal
          open={Boolean(enrollFacility)}
          onClose={() => setEnrollFacility(null)}
          facilityId={enrollFacility.id}
          facilityName={enrollFacility.name}
          onEnrolled={() => {
            showToast("Enrolled in campaign.");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function BreakdownTable({ rows }: { rows: FacilityAnalyticsData["breakdowns"]["byType"] }) {
  if (!rows.length) return <p className="mt-2 text-sm text-slate-500">No breakdown data.</p>;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2">Facilities</th>
            <th className="px-3 py-2">Visited</th>
            <th className="px-3 py-2">Warm</th>
            <th className="px-3 py-2">Packets</th>
            <th className="px-3 py-2">Overdue FU</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="px-3 py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2 text-center">{r.facilities}</td>
              <td className="px-3 py-2 text-center">{r.visited}</td>
              <td className="px-3 py-2 text-center">{r.warm}</td>
              <td className="px-3 py-2 text-center">{r.packetRequests}</td>
              <td className="px-3 py-2 text-center">{r.overdueFollowUps}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
