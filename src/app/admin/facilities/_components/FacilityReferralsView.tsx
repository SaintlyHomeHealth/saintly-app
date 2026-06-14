"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { FacilityAlertBanner } from "@/app/admin/facilities/_components/FacilityAlertBanner";
import { FacilityReferralPipelineCardView } from "@/app/admin/facilities/_components/FacilityReferralPipelineCard";
import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { useFacilityNotifications } from "@/app/admin/facilities/_components/useFacilityNotifications";
import type { FacilityReferralsListResponse } from "@/app/api/facilities/referrals/route";
import type {
  FacilityReferralPipelineCard,
  FacilityReferralPipelineStageKey,
  FacilityReferralPipelineSummary,
  ReferralPipelineHealthRow,
} from "@/lib/crm/facility-referral-pipeline-types";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { LEAD_INTAKE_READINESS_STATUSES } from "@/lib/crm/lead-intake-readiness-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilityReferralsViewProps = {
  staffOptions: StaffOption[];
  canFilterReps: boolean;
  canEditIntake?: boolean;
  currentUserId: string;
};

export function FacilityReferralsView({
  staffOptions,
  canFilterReps,
  canEditIntake = true,
  currentUserId,
}: FacilityReferralsViewProps) {
  const searchParams = useSearchParams();
  const initialFacilityId = searchParams.get("facility_id") ?? "";
  const initialNeedsReview = searchParams.get("needs_source_review") === "1";

  const [stage, setStage] = useState<FacilityReferralPipelineStageKey | "all">("all");
  const [facilityFilter, setFacilityFilter] = useState(initialFacilityId);
  const [repFilter, setRepFilter] = useState(canFilterReps ? "" : currentUserId);
  const [intakeFilter, setIntakeFilter] = useState("");
  const [needsReviewFilter, setNeedsReviewFilter] = useState(initialNeedsReview);
  const [hasDocumentsFilter, setHasDocumentsFilter] = useState(false);
  const [needsDocumentReviewFilter, setNeedsDocumentReviewFilter] = useState(false);
  const [noDocumentsFilter, setNoDocumentsFilter] = useState(false);
  const [aiReviewNeededFilter, setAiReviewNeededFilter] = useState(false);
  const [missingOrderFilter, setMissingOrderFilter] = useState(false);
  const [missingInsuranceFilter, setMissingInsuranceFilter] = useState(false);
  const [missingDemographicsFilter, setMissingDemographicsFilter] = useState(false);
  const [readinessStatusFilter, setReadinessStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<FacilityReferralPipelineCard[]>([]);
  const [summary, setSummary] = useState<FacilityReferralPipelineSummary | null>(null);
  const [health, setHealth] = useState<ReferralPipelineHealthRow[]>([]);

  const { notifications } = useFacilityNotifications({ autoGenerate: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (stage !== "all") params.set("status", stage);
      if (repFilter) params.set("rep_id", repFilter);
      if (intakeFilter) params.set("intake_owner_id", intakeFilter);
      if (facilityFilter) params.set("facility_id", facilityFilter);
      if (needsReviewFilter) params.set("needs_source_review", "1");
      if (hasDocumentsFilter) params.set("has_documents", "1");
      if (needsDocumentReviewFilter) params.set("needs_document_review", "1");
      if (noDocumentsFilter) params.set("no_documents", "1");
      if (aiReviewNeededFilter) params.set("ai_review_needed", "1");
      if (missingOrderFilter) params.set("missing_physician_order", "1");
      if (missingInsuranceFilter) params.set("missing_insurance", "1");
      if (missingDemographicsFilter) params.set("missing_demographics", "1");
      if (readinessStatusFilter) params.set("readiness_status", readinessStatusFilter);
      const res = await fetch(`/api/facilities/referrals?${params.toString()}`);
      const data = (await res.json()) as FacilityReferralsListResponse;
      if (!data.ok) {
        setError("Could not load referrals.");
        return;
      }
      setReferrals(data.referrals);
      setSummary(data.summary);
      setHealth(data.pipeline_health);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [stage, repFilter, intakeFilter, facilityFilter, needsReviewFilter, hasDocumentsFilter, needsDocumentReviewFilter, noDocumentsFilter, aiReviewNeededFilter, missingOrderFilter, missingInsuranceFilter, missingDemographicsFilter, readinessStatusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, FacilityReferralPipelineCard[]> = {};
    for (const s of FACILITY_REFERRAL_PIPELINE_STAGES) map[s.key] = [];
    for (const r of referrals) {
      if (!map[r.pipeline_stage]) map[r.pipeline_stage] = [];
      map[r.pipeline_stage].push(r);
    }
    return map;
  }, [referrals]);

  return (
    <div className="space-y-5">
      {summary ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Total referrals" value={summary.total} />
          <Stat label="Unassigned" value={summary.alerts.unassigned} alert={summary.alerts.unassigned > 0} />
          <Stat label="Stuck 3+ days" value={summary.alerts.stuck_3_days} alert={summary.alerts.stuck_3_days > 0} />
          <Stat label="Waiting orders 3+d" value={summary.alerts.waiting_orders_3_days} />
          <Stat label="Overdue tasks" value={summary.alerts.overdue_tasks} alert={summary.alerts.overdue_tasks > 0} />
          <Stat label="Docs need review" value={summary.alerts.documents_needing_review} alert={summary.alerts.documents_needing_review > 0} />
          <Stat label="With documents" value={summary.alerts.referrals_with_documents} />
        </section>
      ) : null}

      <FacilityAlertBanner
        title="Referral pipeline alerts"
        items={[
          ...(summary && summary.alerts.stuck_3_days > 0
            ? [
                {
                  key: "stuck",
                  title: `${summary.alerts.stuck_3_days} referral${summary.alerts.stuck_3_days === 1 ? "" : "s"} stuck 3+ days`,
                  message: "Review intake status and assign owners if needed.",
                  severity: "warning" as const,
                  actionUrl: "/admin/facilities/referrals",
                },
              ]
            : []),
          ...(summary && summary.alerts.waiting_orders_3_days > 0
            ? [
                {
                  key: "waiting_orders",
                  title: `${summary.alerts.waiting_orders_3_days} waiting on orders/F2F 3+ days`,
                  message: "Chase orders and F2F documentation.",
                  severity: "urgent" as const,
                  actionUrl: "/admin/facilities/referrals?status=waiting_orders",
                },
              ]
            : []),
          ...notifications
            .filter((n) =>
              [
                "facility_referral_stuck",
                "facility_referral_waiting_orders",
                "facility_referral_created",
              ].includes(n.notification_type)
            )
            .slice(0, 3)
            .map((n) => ({
              key: n.id,
              title: n.title,
              message: n.message ?? undefined,
              severity: n.severity,
              actionUrl: n.action_url ?? undefined,
            })),
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStage("all")}
          className={tabCls(stage === "all")}
        >
          All
        </button>
        {FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => (
          <button key={s.key} type="button" onClick={() => setStage(s.key)} className={tabCls(stage === s.key)}>
            {s.label}
            {summary ? ` (${summary.by_stage[s.key] ?? 0})` : ""}
          </button>
        ))}
        </div>
        <SourceReviewNavLink label="Open Source Review Workbench" />
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        {canFilterReps ? (
          <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Sales rep
            <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className={crmFilterInputCls}>
              <option value="">All reps</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Intake owner
          <select value={intakeFilter} onChange={(e) => setIntakeFilter(e.target.value)} className={crmFilterInputCls}>
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Facility ID
          <input
            type="text"
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            placeholder="Filter by facility…"
            className={crmFilterInputCls}
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Readiness status
          <select
            value={readinessStatusFilter}
            onChange={(e) => setReadinessStatusFilter(e.target.value)}
            className={crmFilterInputCls}
          >
            <option value="">All</option>
            {LEAD_INTAKE_READINESS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={needsReviewFilter}
            onChange={(e) => setNeedsReviewFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Needs referral source review
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={hasDocumentsFilter}
            onChange={(e) => setHasDocumentsFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Has documents
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={needsDocumentReviewFilter}
            onChange={(e) => setNeedsDocumentReviewFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Needs document review
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={noDocumentsFilter}
            onChange={(e) => setNoDocumentsFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          No documents
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={aiReviewNeededFilter}
            onChange={(e) => setAiReviewNeededFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          AI review needed
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={missingOrderFilter}
            onChange={(e) => setMissingOrderFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Missing physician order
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={missingInsuranceFilter}
            onChange={(e) => setMissingInsuranceFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Missing insurance
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={missingDemographicsFilter}
            onChange={(e) => setMissingDemographicsFilter(e.target.checked)}
            className="rounded border-slate-300"
          />
          Missing demographics
        </label>
      </div>

      {health.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Referral pipeline health</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Count</th>
                  <th className="px-2 py-1">Avg age</th>
                  <th className="px-2 py-1">Oldest</th>
                  <th className="px-2 py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.stage_key} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-medium">{h.stage_label}</td>
                    <td className="px-2 py-2 tabular-nums">{h.count}</td>
                    <td className="px-2 py-2 tabular-nums">{h.average_age_days ?? "—"}d</td>
                    <td className="px-2 py-2 text-xs">
                      {h.oldest_referral_at ? formatFacilityDate(h.oldest_referral_at) : "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-violet-800">{h.action_needed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading referrals…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && referrals.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No facility-sourced referrals match these filters.
        </p>
      ) : null}

      {stage === "all" ? (
        <div className="hidden gap-4 lg:grid lg:grid-cols-4 xl:grid-cols-7">
          {FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => (
            <div key={s.key} className="min-w-0">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{s.label}</h3>
              <div className="space-y-3">
                {(grouped[s.key] ?? []).map((r) => (
                  <FacilityReferralPipelineCardView
                    key={r.lead_id}
                    referral={r}
                    staffOptions={staffOptions}
                    canEditIntake={canEditIntake}
                    onRefresh={() => void load()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={`space-y-3 ${stage === "all" ? "lg:hidden" : ""}`}>
        {referrals.map((r) => (
          <FacilityReferralPipelineCardView
            key={r.lead_id}
            referral={r}
            staffOptions={staffOptions}
            canEditIntake={canEditIntake}
            onRefresh={() => void load()}
          />
        ))}
      </div>
    </div>
  );
}

function tabCls(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
    active ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
  }`;
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${alert ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
