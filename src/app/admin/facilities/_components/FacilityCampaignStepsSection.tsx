"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import type { CampaignStepCard } from "@/lib/crm/facility-playbook-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

export function FacilityCampaignStepsSection() {
  const [steps, setSteps] = useState<CampaignStepCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/facilities/campaign-steps/due");
        const data = (await res.json()) as { ok: boolean; steps?: CampaignStepCard[] };
        if (data.ok) setSteps(data.steps ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || steps.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Campaign Steps Due</h2>
      {steps.map((step) => {
        const mapsUrl = appleMapsDirectionsUrl({
          address: step.facility_address,
          latitude: step.facility_latitude,
          longitude: step.facility_longitude,
        });
        return (
          <article
            key={step.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${step.is_overdue ? "border-rose-300" : "border-pink-200"}`}
          >
            <p className="text-xs font-bold text-pink-800">{step.campaign_name}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{step.title}</p>
            <Link href={`/admin/facilities/${step.facility_id}`} className="text-sm text-sky-800 hover:underline">
              {step.facility_name}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              Step {step.step_number} of {step.total_steps} · Due {formatFacilityDate(step.due_at)}
            </p>
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
                campaignStepInstanceId={step.id}
                className={crmActionBtnSky}
              />
              <FacilityAiCaptureButton
                facilityId={step.facility_id}
                facilityName={step.facility_name}
                campaignStepInstanceId={step.id}
                className={crmActionBtnMuted}
              />
              <Link href={`/admin/facilities/campaigns/${step.campaign_id}`} className={crmActionBtnMuted}>
                Open Campaign
              </Link>
            </div>
          </article>
        );
      })}
    </section>
  );
}
