"use client";

import Link from "next/link";
import { useState } from "react";

import { FacilityReferralChecklistPanel } from "@/app/admin/facilities/_components/FacilityReferralChecklistPanel";
import { FacilityReferralStatusModal } from "@/app/admin/facilities/_components/FacilityReferralStatusModal";
import { LeadSectionCard } from "@/app/admin/crm/leads/_components/LeadSectionCard";
import type { FacilityReferralLeadPanelData } from "@/lib/crm/facility-referral-pipeline";
import { formatFacilityDateTime } from "@/lib/crm/facility-address";

type LeadFacilityReferralSectionProps = {
  leadId: string;
  data: FacilityReferralLeadPanelData;
};

export function LeadFacilityReferralSection({ leadId, data }: LeadFacilityReferralSectionProps) {
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <LeadSectionCard
        id="facility-referral"
        title="Facility referral attribution"
        description="This lead came from facility outreach. Track intake and source attribution here."
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Referring facility</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              <Link href={`/admin/facilities/${data.facility_id}`} className="text-sky-800 hover:underline">
                {data.facility_name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Facility contact</dt>
            <dd className="mt-1 text-slate-800">{data.facility_contact_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Sales rep credited</dt>
            <dd className="mt-1 text-slate-800">{data.sales_rep_label ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Referral received</dt>
            <dd className="mt-1 text-slate-800">
              {data.referral_received_at ? formatFacilityDateTime(data.referral_received_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Pipeline status</dt>
            <dd className="mt-1 text-slate-800">{data.pipeline_stage_label}</dd>
          </div>
          {data.activity_summary ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Outreach activity</dt>
              <dd className="mt-1 text-slate-800">{data.activity_summary}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/admin/facilities/${data.facility_id}`}
            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900"
          >
            Open Facility
          </Link>
          {data.activity_id ? (
            <Link
              href={`/admin/facilities/${data.facility_id}#activity`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
            >
              View activity history
            </Link>
          ) : null}
          <Link
            href="/admin/facilities/referrals"
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900"
          >
            Facility Referrals pipeline
          </Link>
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="rounded-xl border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
          >
            Update referral status
          </button>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">Intake checklist</h3>
          <div className="mt-3">
            <FacilityReferralChecklistPanel leadId={leadId} checklist={data.checklist} />
          </div>
        </div>
      </LeadSectionCard>

      <FacilityReferralStatusModal
        open={statusOpen}
        leadId={leadId}
        onClose={() => setStatusOpen(false)}
      />
    </>
  );
}
