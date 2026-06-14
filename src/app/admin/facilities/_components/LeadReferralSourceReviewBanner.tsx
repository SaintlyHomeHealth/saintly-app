"use client";

import Link from "next/link";

import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { formatFacilityDateTime } from "@/lib/crm/facility-address";
import type { ReferralSourceReviewTypedSource } from "@/lib/crm/facility-referral-source-review-types";

export type LeadReferralSourceReviewPanel = {
  needs_review: boolean;
  typed_source: ReferralSourceReviewTypedSource;
  match_confidence: number | null;
  match_reason: string | null;
  referral_source_type: string | null;
  reviewed_at: string | null;
  reviewed_by_label: string | null;
  review_outcome: string | null;
  facility_name: string | null;
  facility_id: string | null;
};

type LeadReferralSourceReviewBannerProps = {
  leadId: string;
  panel: LeadReferralSourceReviewPanel;
  canManage: boolean;
};

export function LeadReferralSourceReviewBanner({ leadId, panel, canManage }: LeadReferralSourceReviewBannerProps) {
  const typed = panel.typed_source;

  if (panel.needs_review) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
        <h3 className="text-sm font-bold text-amber-950">Referral source needs review</h3>
        <p className="mt-1 text-sm text-amber-900">
          This lead came from a public referral link but could not be confidently matched to a facility.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase text-amber-800">Typed office</dt>
            <dd>{typed.referring_office_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-amber-800">Contact</dt>
            <dd>{typed.referring_contact_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-amber-800">Match confidence</dt>
            <dd>
              {panel.match_confidence != null ? `${Math.round(panel.match_confidence * 100)}%` : "—"}
              {panel.match_reason ? ` · ${panel.match_reason}` : ""}
            </dd>
          </div>
        </dl>
        {canManage ? (
          <Link
            href={`/admin/facilities/source-review?lead=${leadId}`}
            className="mt-3 inline-flex rounded-lg border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Review Source
          </Link>
        ) : null}
      </div>
    );
  }

  if (panel.reviewed_at || panel.facility_id) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
        <h3 className="text-sm font-bold text-emerald-950">Referral source matched</h3>
        <p className="mt-1 text-sm text-emerald-900">
          {panel.facility_name ? (
            <>
              Facility:{" "}
              {panel.facility_id ? (
                <Link href={`/admin/facilities/${panel.facility_id}`} className="font-semibold underline">
                  {panel.facility_name}
                </Link>
              ) : (
                panel.facility_name
              )}
            </>
          ) : (
            "Review completed without attaching a facility."
          )}
        </p>
        {panel.reviewed_at ? (
          <p className="mt-1 text-xs text-emerald-800">
            Reviewed {formatFacilityDateTime(panel.reviewed_at)}
            {panel.reviewed_by_label ? ` by ${panel.reviewed_by_label}` : ""}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
