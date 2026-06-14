"use client";

import Link from "next/link";
import { useState } from "react";

import { FacilityReferralStatusModal } from "@/app/admin/facilities/_components/FacilityReferralStatusModal";
import type { FacilityReferralPipelineCard } from "@/lib/crm/facility-referral-pipeline-types";
import { LEAD_REFERRAL_DOCUMENT_TYPE_LABELS, type LeadReferralDocumentType } from "@/lib/crm/lead-referral-documents-constants";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

type FacilityReferralPipelineCardViewProps = {
  referral: FacilityReferralPipelineCard;
  staffOptions?: { user_id: string; label: string }[];
  canEditIntake?: boolean;
  onRefresh?: () => void;
};

const urgencyCls = {
  normal: "bg-slate-100 text-slate-700 ring-slate-200",
  attention: "bg-amber-50 text-amber-900 ring-amber-200",
  urgent: "bg-red-50 text-red-800 ring-red-200",
};

export function FacilityReferralPipelineCardView({
  referral,
  staffOptions = [],
  canEditIntake = true,
  onRefresh,
}: FacilityReferralPipelineCardViewProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const tel = referral.phone ? `tel:${referral.phone.replace(/[^\d+]/g, "")}` : null;

  async function assignTo(userId: string) {
    setAssigning(true);
    try {
      await fetch(`/api/facilities/referrals/${referral.lead_id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake_owner_id: userId || null }),
      });
      onRefresh?.();
    } finally {
      setAssigning(false);
    }
  }

  return (
    <>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{referral.patient_name}</h3>
            <p className="text-xs text-slate-600">
              {referral.facility_name ?? referral.typed_referring_facility_name ?? "Unknown facility"}
              {referral.facility_contact_name ? ` · ${referral.facility_contact_name}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {(referral.readiness_status ?? "needs_review") !== "needs_review" ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-900 ring-1 ring-teal-200">
                {String(referral.readiness_status).replace(/_/g, " ")}
                {referral.readiness_score != null ? ` · ${referral.readiness_score}` : ""}
              </span>
            ) : null}
            {(referral.readiness_missing_count ?? 0) > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                {referral.readiness_missing_count} missing
              </span>
            ) : null}
            {referral.needs_referral_source_review ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                Source review
              </span>
            ) : null}
            {(referral.documents_needing_review ?? 0) > 0 ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900 ring-1 ring-violet-200">
                Needs document review
              </span>
            ) : null}
            {(referral.document_count ?? 0) > 0 ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900 ring-1 ring-sky-200">
                Documents: {referral.document_count}
              </span>
            ) : null}
            {(referral.ai_review_needed_count ?? 0) > 0 && (referral.document_count ?? 0) > 0 ? (
              <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-900 ring-1 ring-fuchsia-200">
                AI review needed
              </span>
            ) : null}
            {(referral.ai_reviewed_count ?? 0) > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200">
                AI reviewed
              </span>
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${urgencyCls[referral.urgency]}`}
            >
              {referral.urgency}
            </span>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd>{referral.phone ? formatPhoneForDisplay(referral.phone) : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Payer</dt>
            <dd>{referral.payer ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Service</dt>
            <dd>{referral.service_needed ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Age</dt>
            <dd>{referral.referral_age_days}d</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sales rep</dt>
            <dd>{referral.sales_rep_label ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Intake owner</dt>
            <dd>{referral.intake_owner_label ?? "Needs assignment"}</dd>
          </div>
        </dl>

        {referral.needs_referral_source_review && referral.typed_referring_facility_name ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
            Typed office: {referral.typed_referring_facility_name}
            {referral.referral_source_match_confidence != null
              ? ` · match ${Math.round(referral.referral_source_match_confidence * 100)}%`
              : ""}
          </p>
        ) : null}

        {referral.next_task_title ? (
          <p className="mt-2 text-xs text-violet-800">
            Next: {referral.next_task_title}
            {referral.next_task_due ? ` · due ${formatFacilityDate(referral.next_task_due)}` : ""}
          </p>
        ) : null}

        {referral.readiness_next_action ? (
          <p className="mt-2 text-xs font-medium text-teal-800">{referral.readiness_next_action}</p>
        ) : null}

        {(referral.document_count ?? 0) > 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            Documents: {(referral.document_types ?? [])
              .slice(0, 3)
              .map((t) =>
                LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[t as LeadReferralDocumentType] ?? t
              )
              .join(", ")}
            {(referral.document_types?.length ?? 0) > 3 ? "…" : ""}
            {(referral.documents_needing_review ?? 0) > 0
              ? ` · ${referral.documents_needing_review} need review`
              : ""}
          </p>
        ) : null}

        {referral.missing_physician_order || referral.ai_missing_physician_order ? (
          <p className="mt-1 text-xs font-medium text-amber-800">Missing physician order</p>
        ) : null}
        {referral.ai_missing_insurance ? (
          <p className="mt-1 text-xs font-medium text-amber-800">Missing insurance</p>
        ) : null}
        {referral.missing_face_sheet || referral.ai_missing_demographics ? (
          <p className="mt-1 text-xs font-medium text-amber-800">Missing face sheet / demographics</p>
        ) : null}

        {referral.lost_reason ? (
          <p className="mt-2 text-xs text-slate-600">Lost: {referral.lost_reason}</p>
        ) : null}

        {canEditIntake && staffOptions.length > 0 ? (
          <div className="mt-2">
            <label className="text-[10px] font-semibold uppercase text-slate-500">Assign intake</label>
            <select
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              value={referral.intake_owner_id ?? ""}
              disabled={assigning}
              onChange={(e) => void assignTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link href={`/admin/crm/leads/${referral.lead_id}`} className={`${crmActionBtnSky} text-center text-xs`}>
            Open Lead
          </Link>
          {referral.facility_id ? (
            <Link
              href={`/admin/facilities/${referral.facility_id}`}
              className={`${crmActionBtnMuted} text-center text-xs`}
            >
              Open Facility
            </Link>
          ) : null}
          {tel ? (
            <a href={tel} className={`${crmActionBtnMuted} text-center text-xs`}>
              Call Patient
            </a>
          ) : null}
          <button type="button" className={`${crmActionBtnMuted} text-xs`} onClick={() => setStatusOpen(true)}>
            Update Status
          </button>
          {referral.needs_referral_source_review ? (
            <Link
              href={`/admin/facilities/source-review?lead=${referral.lead_id}`}
              className={`${crmActionBtnMuted} text-center text-xs text-amber-900`}
            >
              Review Source
            </Link>
          ) : null}
        </div>
      </article>

      <FacilityReferralStatusModal
        open={statusOpen}
        leadId={referral.lead_id}
        currentStageKey={referral.pipeline_stage}
        onClose={() => setStatusOpen(false)}
        onSaved={onRefresh}
      />
    </>
  );
}
