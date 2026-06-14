"use client";

import Link from "next/link";
import { useState } from "react";

import { FacilityReferralLeadModal } from "@/app/admin/facilities/_components/FacilityReferralLeadModal";
import type { FacilityReferralAttributionSummary } from "@/lib/crm/facility-referral-lead-types";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

type FacilityReferralAttributionSectionProps = {
  facilityId: string;
  facilityName: string;
  attribution: FacilityReferralAttributionSummary;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultRepId?: string | null;
};

const btnPrimary =
  "inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm";

export function FacilityReferralAttributionSection({
  facilityId,
  facilityName,
  attribution,
  contacts = [],
  staffOptions = [],
  defaultRepId,
}: FacilityReferralAttributionSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Referral attribution</h3>
          <p className="mt-1 text-xs text-slate-600">CRM leads linked to this facility from outreach.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/facilities/referrals?facility_id=${facilityId}`}
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900"
          >
            Facility Referrals
          </Link>
          <button type="button" className={btnPrimary} onClick={() => setModalOpen(true)}>
            New Referral from Facility
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total referral leads" value={attribution.total_leads} />
        <Stat label="Open referrals" value={attribution.open_referrals} />
        <Stat label="Converted patients" value={attribution.converted} />
        <Stat label="Lost / not eligible" value={attribution.lost} />
      </div>

      {(attribution.referrals_needing_info ?? 0) > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <p className="text-sm font-medium text-amber-950">
            Missing referral info needed ({attribution.referrals_needing_info} open referral
            {attribution.referrals_needing_info === 1 ? "" : "s"})
          </p>
          <Link
            href={`/admin/facilities/referrals?facility_id=${facilityId}&readiness_status=needs_info`}
            className="text-sm font-semibold text-amber-900 underline"
          >
            Open Intake Review
          </Link>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last referral</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {attribution.last_referral_at ? formatFacilityDate(attribution.last_referral_at) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last outcome</dt>
          <dd className="mt-1 font-semibold text-slate-900">{attribution.last_referral_outcome ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending intake tasks</dt>
          <dd className="mt-1 font-semibold text-slate-900">{attribution.pending_intake_tasks}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top producing contact</dt>
          <dd className="mt-1 font-semibold text-slate-900">{attribution.top_contact_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sales rep credited</dt>
          <dd className="mt-1 font-semibold text-slate-900">{attribution.top_rep_label ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next source follow-up</dt>
          <dd className="mt-1 text-slate-800">
            {attribution.next_source_follow_up ? (
              <>
                {attribution.next_source_follow_up.title}
                <span className="block text-xs text-slate-500">
                  Due {formatFacilityDateTime(attribution.next_source_follow_up.due_at)}
                </span>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {attribution.recent_leads.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Patient / prospect</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Readiness</th>
                <th className="px-4 py-3">Intake owner</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Payer</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attribution.recent_leads.map((lead) => (
                <tr key={lead.lead_id} className="bg-white/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{lead.patient_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{lead.pipeline_stage_label}</td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-700">
                    {lead.readiness_status ? lead.readiness_status.replace(/_/g, " ") : "—"}
                    {lead.readiness_score != null ? ` (${lead.readiness_score})` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{lead.intake_owner_label ?? "Needs assignment"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{lead.service_type ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{lead.payer_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                    {formatFacilityDate(lead.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                    {formatFacilityDate(lead.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/crm/leads/${lead.lead_id}#section-intake-readiness`}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Open Lead
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">No referral leads from this facility yet.</p>
      )}

      <FacilityReferralLeadModal
        open={modalOpen}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaults={{ defaultRepId }}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
