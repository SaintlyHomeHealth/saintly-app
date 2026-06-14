"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import {
  FacilityCampaignEnrollmentPicker,
} from "@/app/admin/facilities/_components/FacilityCampaignEnrollmentPicker";
import { ShowReferralQrButton } from "@/app/admin/facilities/_components/ShowReferralQrButton";
import type { BulkEnrollResult, CampaignDetail, CampaignEnrollmentCard } from "@/lib/crm/facility-playbook-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilityCampaignDetailViewProps = {
  campaignId: string;
  canManage: boolean;
  staffOptions?: StaffOption[];
};

export function FacilityCampaignDetailView({
  campaignId,
  canManage,
  staffOptions = [],
}: FacilityCampaignDetailViewProps) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [listFilterStatus, setListFilterStatus] = useState("");
  const [listFilterRep, setListFilterRep] = useState("");
  const [listFilterCity, setListFilterCity] = useState("");
  const [listFilterType, setListFilterType] = useState("");
  const [listFilterOverdue, setListFilterOverdue] = useState(false);
  const [listFilterHasReferral, setListFilterHasReferral] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/campaigns/${campaignId}`);
      const data = (await res.json()) as { ok: boolean; campaign?: CampaignDetail };
      if (!data.ok || !data.campaign) {
        setError("Could not load campaign.");
        return;
      }
      setCampaign(data.campaign);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleEnrolled(result: BulkEnrollResult) {
    const parts: string[] = [];
    if (result.enrolled_count > 0) parts.push(`${result.enrolled_count} enrolled`);
    if (result.skipped_existing_count > 0) parts.push(`${result.skipped_existing_count} already enrolled`);
    if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
    setToast(parts.join(". ") || "Enrollment complete.");
    void load();
  }

  async function stepAction(stepId: string, action: "complete" | "skip") {
    await fetch(`/api/facilities/campaign-steps/${stepId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    void load();
  }

  const filteredEnrollments = useMemo(() => {
    if (!campaign) return [];
    return campaign.enrollments.filter((e) => {
      if (listFilterStatus && e.status !== listFilterStatus) return false;
      if (listFilterRep && e.assigned_rep_id !== listFilterRep) return false;
      if (listFilterCity && !(e.facility_city ?? "").toLowerCase().includes(listFilterCity.toLowerCase())) return false;
      if (listFilterType && !(e.facility_type ?? "").toLowerCase().includes(listFilterType.toLowerCase())) return false;
      if (listFilterOverdue && !e.has_overdue_step) return false;
      if (listFilterHasReferral === "yes" && e.referral_count === 0) return false;
      if (listFilterHasReferral === "no" && e.referral_count > 0) return false;
      return true;
    });
  }, [campaign, listFilterStatus, listFilterRep, listFilterCity, listFilterType, listFilterOverdue, listFilterHasReferral]);

  if (loading) return <p className="text-sm text-slate-600">Loading campaign…</p>;
  if (error || !campaign) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error ?? "Not found"}</div>;
  }

  const summary = campaign.enrollment_summary ?? {
    total_enrolled: campaign.facilities_enrolled,
    active: campaign.enrollments.filter((e) => e.status === "active").length,
    completed: campaign.enrollments.filter((e) => e.status === "completed").length,
    paused: campaign.enrollments.filter((e) => e.status === "paused").length,
    removed: 0,
    not_started: campaign.enrollments.filter((e) => e.status === "active" && e.current_step_number === 1).length,
    steps_due_today: campaign.due_steps.length,
    steps_overdue: campaign.overdue_steps.length,
    referrals_generated: campaign.referrals_generated,
    converted_referrals: campaign.converted_referrals,
  };

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-pink-800">{campaign.playbook_name ?? "Campaign"}</p>
            <h2 className="text-xl font-bold text-slate-900">{campaign.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {campaign.assigned_rep_label ?? "Unassigned"} · {campaign.status} · Started {campaign.start_date}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShowReferralQrButton
              campaignId={campaignId}
              label={`${campaign.name} referral link`}
              linkType="campaign"
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950"
            />
            <Link
              href={`/admin/facilities/source-links?campaign_id=${campaignId}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              Manage links
            </Link>
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-lg border border-pink-600 bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
                >
                  Add Facilities
                </button>
                <button
                  type="button"
                  onClick={() => void fetch(`/api/facilities/campaigns/${campaignId}/pause`, { method: "POST" }).then(() => load())}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950"
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => void fetch(`/api/facilities/campaigns/${campaignId}/complete`, { method: "POST" }).then(() => load())}
                  className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Complete
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Total enrolled", value: summary.total_enrolled },
            { label: "Active", value: summary.active },
            { label: "Completed", value: summary.completed },
            { label: "Paused", value: summary.paused },
            { label: "Not started", value: summary.not_started },
            { label: "Steps due today", value: summary.steps_due_today },
            { label: "Steps overdue", value: summary.steps_overdue },
            { label: "Referrals", value: summary.referrals_generated },
            { label: "Converted", value: summary.converted_referrals },
            { label: "Progress", value: `${campaign.progress_pct}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-500">{s.label}</p>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      {(campaign.overdue_steps.length > 0 || campaign.due_steps.length > 0) ? (
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Due / overdue steps</h3>
          {[...campaign.overdue_steps, ...campaign.due_steps].map((step) => {
            const mapsUrl = appleMapsDirectionsUrl({
              address: step.facility_address,
              latitude: step.facility_latitude,
              longitude: step.facility_longitude,
            });
            return (
              <article key={step.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${step.is_overdue ? "border-rose-300" : "border-slate-200"}`}>
                <p className="text-xs font-bold text-pink-800">
                  Step {step.step_number} of {step.total_steps}: {step.title}
                </p>
                <Link href={`/admin/facilities/${step.facility_id}`} className="mt-1 block text-base font-semibold text-slate-900 hover:underline">
                  {step.facility_name}
                </Link>
                <p className="text-xs text-slate-500">Due {formatFacilityDate(step.due_at)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className={`${crmActionBtnMuted} min-h-[2.5rem]`}>
                      Directions
                    </a>
                  ) : null}
                  <FacilityQuickLogButton
                    facilityId={step.facility_id}
                    facilityName={step.facility_name}
                    defaultActivityType={step.suggested_activity_type ?? undefined}
                    defaultOutcome={step.suggested_outcome ?? undefined}
                    defaultNotes={`Campaign: ${step.campaign_name}\nStep: ${step.title}`}
                    campaignStepInstanceId={step.id}
                    className={crmActionBtnSky}
                  >
                    Quick Log
                  </FacilityQuickLogButton>
                  <FacilityAiCaptureButton
                    facilityId={step.facility_id}
                    facilityName={step.facility_name}
                    campaignStepInstanceId={step.id}
                    className={crmActionBtnMuted}
                  />
                  <button type="button" onClick={() => void stepAction(step.id, "complete")} className={crmActionBtnSky}>
                    Complete
                  </button>
                  <button type="button" onClick={() => void stepAction(step.id, "skip")} className={crmActionBtnMuted}>
                    Skip
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Enrollments</h3>
          <div className="flex flex-wrap gap-2">
            <select value={listFilterStatus} onChange={(e) => setListFilterStatus(e.target.value)} className={`${crmFilterInputCls} text-xs`}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
            </select>
            {canManage && staffOptions.length > 0 ? (
              <select value={listFilterRep} onChange={(e) => setListFilterRep(e.target.value)} className={`${crmFilterInputCls} text-xs`}>
                <option value="">All reps</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              value={listFilterCity}
              onChange={(e) => setListFilterCity(e.target.value)}
              placeholder="City"
              className={`${crmFilterInputCls} w-24 text-xs`}
            />
            <input
              value={listFilterType}
              onChange={(e) => setListFilterType(e.target.value)}
              placeholder="Type"
              className={`${crmFilterInputCls} w-24 text-xs`}
            />
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={listFilterOverdue} onChange={(e) => setListFilterOverdue(e.target.checked)} />
              Overdue
            </label>
            <select
              value={listFilterHasReferral}
              onChange={(e) => setListFilterHasReferral(e.target.value)}
              className={`${crmFilterInputCls} text-xs`}
            >
              <option value="">Referrals</option>
              <option value="yes">Has referral</option>
              <option value="no">No referral</option>
            </select>
          </div>
        </div>

        {filteredEnrollments.length === 0 ? (
          <p className="text-sm text-slate-600">
            {campaign.enrollments.length === 0
              ? "No facilities enrolled yet. Use Add Facilities to enroll."
              : "No enrollments match filters."}
          </p>
        ) : (
          filteredEnrollments.map((e: CampaignEnrollmentCard) => (
            <div
              key={e.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 ${e.has_overdue_step ? "border-rose-200" : "border-slate-200"}`}
            >
              <div>
                <Link href={`/admin/facilities/${e.facility_id}`} className="font-semibold text-sky-900 hover:underline">
                  {e.facility_name}
                </Link>
                <p className="text-xs text-slate-500">
                  {[e.facility_type, e.facility_city].filter(Boolean).join(" · ")} · Step {e.current_step_number} of{" "}
                  {e.total_steps} · {e.status}
                  {e.referral_count > 0 ? ` · ${e.referral_count} referral${e.referral_count === 1 ? "" : "s"}` : ""}
                </p>
                {e.assigned_rep_label ? <p className="text-xs text-slate-400">Rep: {e.assigned_rep_label}</p> : null}
              </div>
              {e.next_task_id ? (
                <Link href="/admin/facilities/follow-ups" className="text-xs font-semibold text-amber-800 hover:underline">
                  Open follow-up
                </Link>
              ) : null}
            </div>
          ))
        )}
      </section>

      {canManage ? (
        <FacilityCampaignEnrollmentPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          campaignId={campaignId}
          campaignName={campaign.name}
          staffOptions={staffOptions}
          onEnrolled={handleEnrolled}
        />
      ) : null}
    </div>
  );
}
