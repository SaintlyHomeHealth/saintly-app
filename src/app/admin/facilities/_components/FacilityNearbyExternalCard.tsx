"use client";

import Link from "next/link";

import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { DiscoverExternalResult } from "@/app/api/facilities/discover/route";
import { crmActionBtnMuted, crmActionBtnSky, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import {
  addExternalPlaceToRouteDraft,
  addFacilityToRouteDraft,
  isStopInRouteDraft,
  notifyRouteDraftChanged,
  removeStopFromRouteDraft,
} from "@/lib/crm/facility-route-draft";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

function MatchBadge({ status }: { status: "already_in_portal" | "possible_match" | "not_in_portal" }) {
  if (status === "already_in_portal") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
        In Saintly Portal
      </span>
    );
  }
  if (status === "possible_match") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-950 ring-1 ring-amber-200">
        Possible Match
      </span>
    );
  }
  return (
    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-900 ring-1 ring-violet-200">
      New Google Result
    </span>
  );
}

export function FacilityNearbyExternalCard({
  item,
  onRouteChange,
  onQuickAdd,
  onReviewMatch,
  savedAsPortalId,
  sourceContext,
}: {
  item: DiscoverExternalResult;
  /** @deprecated use internal route state from matched facility / google place id */
  inRoute?: boolean;
  onRouteChange: () => void;
  onQuickAdd: () => void;
  onReviewMatch: () => void;
  savedAsPortalId?: string | null;
  sourceContext?: "discover" | "finder";
}) {
  const portalFacilityId = savedAsPortalId ?? item.matched_facility_id ?? null;
  const isInPortal = Boolean(portalFacilityId);
  const effectiveStatus = isInPortal ? "already_in_portal" : item.match_status;
  const captureContext = sourceContext ?? "discover";

  const tel = item.phone?.trim() ? `tel:${item.phone.replace(/[^\d+]/g, "")}` : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: item.formatted_address,
    latitude: item.latitude,
    longitude: item.longitude,
  });

  const routeIn = portalFacilityId
    ? isStopInRouteDraft({ facilityId: portalFacilityId })
    : isStopInRouteDraft({ googlePlaceId: item.google_place_id });

  const toggleRoute = () => {
    if (portalFacilityId) {
      if (routeIn) {
        removeStopFromRouteDraft({ facilityId: portalFacilityId });
      } else {
        addFacilityToRouteDraft(portalFacilityId, item.name, {
          address: item.formatted_address,
          phone: item.phone,
          latitude: item.latitude,
          longitude: item.longitude,
          type: item.type,
        });
      }
    } else if (routeIn) {
      removeStopFromRouteDraft({ googlePlaceId: item.google_place_id });
    } else {
      addExternalPlaceToRouteDraft({
        googlePlaceId: item.google_place_id,
        name: item.name,
        address: item.formatted_address,
        address_line_1: item.address_line_1,
        city: item.city,
        state: item.state,
        zip: item.zip,
        phone: item.phone,
        website: item.website,
        latitude: item.latitude,
        longitude: item.longitude,
        type: item.type,
        portalStatus: "not_in_portal",
      });
    }
    notifyRouteDraftChanged();
    onRouteChange();
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MatchBadge status={effectiveStatus} />
            {item.distance_miles != null ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                {item.distance_label}
              </span>
            ) : null}
            {item.rating != null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                ★ {item.rating.toFixed(1)}
              </span>
            ) : null}
            {item.open_now === true ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                Open now
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {[item.type, item.categories.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || "—"}
      </p>
      <p className="mt-2 text-sm text-slate-700">{item.formatted_address}</p>
      {item.phone ? <p className="mt-1 text-sm text-slate-700">{formatPhoneForDisplay(item.phone)}</p> : null}
      {item.match_reason && effectiveStatus === "possible_match" ? (
        <p className="mt-2 text-xs text-slate-500">{item.match_reason}</p>
      ) : null}

      {isInPortal && portalFacilityId ? (
        <div className="mt-4 space-y-3">
          <Link
            href={`/admin/facilities/${portalFacilityId}`}
            className={`${crmPrimaryCtaCls} flex w-full min-h-[2.75rem] items-center justify-center text-sm font-bold`}
          >
            Open Facility File
          </Link>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              facilityId={portalFacilityId}
              facilityName={item.name}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            >
              Add Note
            </FacilityQuickLogButton>
            <FacilityAiCaptureButton
              facilityId={portalFacilityId}
              facilityName={item.name}
              sourceContext={captureContext}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            />
            <FacilityPhotoNoteButton
              facilityId={portalFacilityId}
              facilityName={item.name}
              sourceContext={captureContext}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
            />
            <button
              type="button"
              onClick={toggleRoute}
              className={`${crmActionBtnMuted} min-h-[2.5rem] ${routeIn ? "border-emerald-300 bg-emerald-50 text-emerald-900" : ""}`}
            >
              {routeIn ? "In route ✓" : "Add to Route"}
            </button>
          </div>
        </div>
      ) : (
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

          {effectiveStatus === "not_in_portal" ? (
            <button type="button" onClick={onQuickAdd} className={`${crmActionBtnSky} min-h-[2.5rem]`}>
              Quick Add to Portal
            </button>
          ) : null}

          {effectiveStatus === "possible_match" ? (
            <>
              <button type="button" onClick={onReviewMatch} className={`${crmActionBtnSky} min-h-[2.5rem]`}>
                Review Match
              </button>
              {item.matched_facility_id ? (
                <Link
                  href={`/admin/facilities/${item.matched_facility_id}`}
                  className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
                >
                  Use Existing
                </Link>
              ) : null}
              <button type="button" onClick={onQuickAdd} className={`${crmActionBtnMuted} min-h-[2.5rem]`}>
                Create Anyway
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={toggleRoute}
            className={`${crmActionBtnMuted} min-h-[2.5rem] ${routeIn ? "border-emerald-300 bg-emerald-50 text-emerald-900" : ""}`}
          >
            {routeIn ? "In route ✓" : "Add to Route"}
          </button>
        </div>
      )}
    </article>
  );
}
