"use client";

import { memo, useCallback } from "react";
import Link from "next/link";

import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityDueBadge } from "@/app/admin/facilities/_components/FacilityDueBadge";
import { FacilityNewReferralButton } from "@/app/admin/facilities/_components/FacilityNewReferralButton";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { ShowReferralQrButton } from "@/app/admin/facilities/_components/ShowReferralQrButton";
import type { OutreachFacilityCard } from "@/lib/crm/facility-outreach-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import {
  addFacilityToRouteDraft,
  notifyRouteDraftChanged,
  removeStopFromRouteDraft,
} from "@/lib/crm/facility-route-draft";
import { facilityDueCardBorderClass } from "@/lib/crm/facility-territory-due";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

type OutreachFacilityCardProps = {
  facility: OutreachFacilityCard;
  showWhy?: boolean;
  showDue?: boolean;
  inRoute: boolean;
  onRouteChange: () => void;
};

export const OutreachFacilityCardView = memo(function OutreachFacilityCardView({
  facility,
  showWhy,
  showDue,
  inRoute,
  onRouteChange,
}: OutreachFacilityCardProps) {
  const tel = (facility.phone ?? "").trim()
    ? `tel:${facility.phone!.replace(/[^\d+]/g, "")}`
    : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: facility.address,
    latitude: facility.latitude,
    longitude: facility.longitude,
  });

  const toggleRoute = useCallback(() => {
    if (inRoute) removeStopFromRouteDraft({ facilityId: facility.id });
    else {
      addFacilityToRouteDraft(facility.id, facility.name, {
        address: facility.address,
        phone: facility.phone,
        latitude: facility.latitude,
        longitude: facility.longitude,
        type: facility.type,
      });
    }
    notifyRouteDraftChanged();
    onRouteChange();
  }, [facility, inRoute, onRouteChange]);

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${facilityDueCardBorderClass(facility.dueBand)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{facility.name}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {[facility.type, facility.city].filter(Boolean).join(" · ") || "—"}
          </p>
          {facility.distanceLabel ? (
            <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/80">
              {facility.distanceLabel}
            </span>
          ) : null}
        </div>
        {showDue ? <FacilityDueBadge band={facility.dueBand} /> : null}
      </div>

      <p className="mt-2 text-sm text-slate-700">{facility.address || "—"}</p>

      {showWhy && facility.whyPriority ? (
        <p className="mt-2 rounded-lg bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900">
          {facility.whyPriority}
        </p>
      ) : null}

      {facility.lastActivitySummary ? (
        <p className="mt-2 line-clamp-2 text-xs text-slate-600">{facility.lastActivitySummary}</p>
      ) : null}

      {facility.profileHints &&
      (facility.profileHints.best_contact_name ||
        facility.profileHints.preferred_method ||
        facility.profileHints.next_best_action) ? (
        <p className="mt-2 line-clamp-2 text-xs text-violet-800">
          {[
            facility.profileHints.best_contact_name ? `Best contact: ${facility.profileHints.best_contact_name}` : null,
            facility.profileHints.preferred_method ? `Preferred: ${facility.profileHints.preferred_method}` : null,
            facility.profileHints.referral_potential ? `Potential: ${facility.profileHints.referral_potential}` : null,
          ]
            .filter(Boolean)
            .slice(0, 2)
            .join(" · ")}
          {facility.profileHints.next_best_action ? (
            <span className="block mt-0.5 text-violet-900">Next: {facility.profileHints.next_best_action}</span>
          ) : null}
        </p>
      ) : null}

      {(facility.referralLeadsTotal ?? 0) > 0 || (facility.referralPipelineOpen ?? 0) > 0 ? (
        <div className="mt-2 space-y-1">
          {(facility.referralPipelineOpen ?? 0) > 0 ? (
            <p className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900">
              {facility.referralPipelineOpen} open referral{facility.referralPipelineOpen === 1 ? "" : "s"}
              {(facility.referralPipelineWaitingOrders ?? 0) > 0
                ? ` · ${facility.referralPipelineWaitingOrders} waiting on orders`
                : ""}
              {(facility.referralPipelineConvertedMonth ?? 0) > 0
                ? ` · ${facility.referralPipelineConvertedMonth} converted this month`
                : ""}
            </p>
          ) : null}
          {(facility.referralsNeedingInfo ?? 0) > 0 ? (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
              {facility.referralsNeedingInfo} referral{facility.referralsNeedingInfo === 1 ? "" : "s"} needs info
            </p>
          ) : null}
          {(facility.referralLeadsTotal ?? 0) > 0 ? (
            <p className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
              {facility.referralLeadsTotal} referral{facility.referralLeadsTotal === 1 ? "" : "s"} created
              {facility.lastReferralAt ? ` · Last: ${formatFacilityDate(facility.lastReferralAt)}` : ""}
              {(facility.referralLeadsConverted ?? 0) > 0 ? ` · Converted: ${facility.referralLeadsConverted}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
        <div>
          <span className="text-slate-500">Last visit</span>
          <div>{facility.lastVisitAt ? formatFacilityDate(facility.lastVisitAt) : "Never"}</div>
        </div>
        {showDue ? (
          <div>
            <span className="text-slate-500">Follow-up</span>
            <div className="font-medium text-slate-800">{facility.dueLabel}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}>
            Directions
          </a>
        ) : (
          <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed opacity-50`}>Directions</span>
        )}
        {tel ? (
          <a href={tel} className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}>
            Call
          </a>
        ) : (
          <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed opacity-50`}>Call</span>
        )}
        <FacilityQuickLogButton
          facilityId={facility.id}
          facilityName={facility.name}
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
        />
        <FacilityNewReferralButton
          facilityId={facility.id}
          facilityName={facility.name}
          className={`${crmActionBtnMuted} min-h-[2.5rem] border-emerald-200 bg-emerald-50 text-center text-emerald-900`}
        />
        <ShowReferralQrButton
          facilityId={facility.id}
          facilityName={facility.name}
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
          showCopy={false}
        />
        <FacilityAiCaptureButton
          facilityId={facility.id}
          facilityName={facility.name}
          sourceContext="finder"
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
        />
        <FacilityPhotoNoteButton
          facilityId={facility.id}
          facilityName={facility.name}
          sourceContext="finder"
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
        />
        <Link href={`/admin/facilities/${facility.id}`} className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}>
          Open
        </Link>
        <button
          type="button"
          onClick={toggleRoute}
          className={`${crmActionBtnMuted} min-h-[2.5rem] ${inRoute ? "border-emerald-300 bg-emerald-50 text-emerald-900" : ""}`}
        >
          {inRoute ? "In route ✓" : "Add to Route"}
        </button>
      </div>
    </article>
  );
});
