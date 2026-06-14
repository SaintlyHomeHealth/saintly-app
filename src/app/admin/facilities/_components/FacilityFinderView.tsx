"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityDueBadge } from "@/app/admin/facilities/_components/FacilityDueBadge";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { FacilityFinderResponse, FacilityFinderResult } from "@/app/api/facilities/finder/route";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import {
  FACILITY_FIELD_FILTERS,
  type FacilityFieldFilterId,
} from "@/lib/crm/facility-finder-query";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import {
  addFacilityToRouteDraft,
  getFacilityRouteDraft,
  getFacilityRouteDraftCount,
  notifyRouteDraftChanged,
  removeStopFromRouteDraft,
  FACILITY_ROUTE_DRAFT_EVENT,
} from "@/lib/crm/facility-route-draft";
import {
  computeFacilityDueInfo,
  facilityDueCardBorderClass,
  formatDueYmdAsDisplay,
} from "@/lib/crm/facility-territory-due";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

const btnField =
  "inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.98]";

const btnPrimary = `${btnField} border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sky-200/50 hover:shadow-md`;
const btnSecondary = `${btnField} border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60`;
const btnChip =
  "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]";
const btnChipActive = `${btnChip} border-sky-600 bg-sky-600 text-white shadow-sm`;
const btnChipIdle = `${btnChip} border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50`;

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "denied" | "unavailable" | "error"; message: string };

function FacilityFinderCard({
  facility,
  onRouteChange,
  inRoute,
}: {
  facility: FacilityFinderResult;
  onRouteChange: () => void;
  inRoute: boolean;
}) {
  const tel = (facility.phone ?? "").trim()
    ? `tel:${facility.phone!.replace(/[^\d+]/g, "")}`
    : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: facility.address,
    latitude: facility.latitude,
    longitude: facility.longitude,
  });
  const due = computeFacilityDueInfo({
    last_visit_at: facility.lastVisitAt,
    next_follow_up_at: facility.nextFollowUpAt,
    visit_frequency: null,
  });

  const toggleRoute = () => {
    if (inRoute) {
      removeStopFromRouteDraft({ facilityId: facility.id });
    } else {
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
  };

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${facilityDueCardBorderClass(due.band)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-snug text-slate-900">{facility.name}</h3>
            {facility.distanceMiles != null ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/80">
                {facility.distanceLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {[facility.type, facility.city].filter(Boolean).join(" · ") || "—"}
          </p>
          {facility.matchExplanation ? (
            <p className="mt-1 text-xs text-sky-800">Matched: {facility.matchExplanation}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <FacilityDueBadge band={due.band} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
            {facility.status}
          </span>
          {facility.priority === "High" ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200/80">
              High priority
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm text-slate-700">
        {facility.address ? <p>{facility.address}</p> : null}
        {facility.phone ? (
          <p>
            <span className="text-slate-500">Phone </span>
            {formatPhoneForDisplay(facility.phone)}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
        <div>
          <span className="font-medium text-slate-500">Last visit</span>
          <div className="text-slate-800">{formatFacilityDate(facility.lastVisitAt)}</div>
        </div>
        <div>
          <span className="font-medium text-slate-500">Next follow-up</span>
          <div className="text-slate-800">
            {facility.nextFollowUpAt
              ? formatFacilityDate(facility.nextFollowUpAt)
              : formatDueYmdAsDisplay(due.effectiveNextDueYmd)}
          </div>
        </div>
        <div className="col-span-2">
          <span className="font-medium text-slate-500">Assigned rep</span>
          <div className="text-slate-800">{facility.assignedRepLabel ?? "—"}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
          >
            Directions
          </a>
        ) : (
          <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed text-center opacity-50`}>
            Directions
          </span>
        )}
        {tel ? (
          <a href={tel} className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}>
            Call
          </a>
        ) : (
          <span className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed text-center opacity-50`}>
            Call
          </span>
        )}
        <FacilityQuickLogButton
          facilityId={facility.id}
          facilityName={facility.name}
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
        />
        <FacilityAiCaptureButton
          facilityId={facility.id}
          facilityName={facility.name}
          sourceContext="finder"
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
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
}

export function FacilityFinderView() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState<FacilityFieldFilterId | null>(null);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [results, setResults] = useState<FacilityFinderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeCount, setRouteCount] = useState(0);
  const [routeIds, setRouteIds] = useState<Set<string>>(new Set());

  const refreshRouteState = useCallback(() => {
    const draft = getFacilityRouteDraft();
    setRouteCount(getFacilityRouteDraftCount());
    setRouteIds(new Set(draft.stops.map((s) => s.facilityId).filter((id): id is string => Boolean(id))));
  }, []);

  useEffect(() => {
    refreshRouteState();
    const onDraftChange = () => refreshRouteState();
    window.addEventListener(FACILITY_ROUTE_DRAFT_EVENT, onDraftChange);
    return () => window.removeEventListener(FACILITY_ROUTE_DRAFT_EVENT, onDraftChange);
  }, [refreshRouteState]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({
        status: "unavailable",
        message: "Location is not supported in this browser.",
      });
      return;
    }
    setLocation({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          status: "ready",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable location to sort by distance."
            : "Could not get your location. Try again or search by city.";
        setLocation({
          status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
          message,
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    let cancelled = false;
    async function runSearch() {
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = {
          query: debouncedQuery,
          fieldFilter,
        };
        if (location.status === "ready") {
          body.latitude = location.latitude;
          body.longitude = location.longitude;
        }
        const res = await fetch("/api/facilities/finder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error ?? "search_failed");
        }
        const data = (await res.json()) as FacilityFinderResponse;
        if (!cancelled) setResults(data.results);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Search failed");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, fieldFilter, location]);

  const locationHint = useMemo(() => {
    if (location.status === "requesting") return "Getting your location…";
    if (location.status === "ready") return "Sorted by distance from you";
    if (location.status === "denied" || location.status === "error" || location.status === "unavailable") {
      return location.message;
    }
    return null;
  }, [location]);

  return (
    <div className="space-y-4 pb-24">
      <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/facilities/discover" className={btnSecondary}>
            Discover New Facilities
          </Link>
          <button type="button" onClick={requestLocation} className={btnSecondary}>
            {location.status === "requesting" ? "Locating…" : "Refresh location"}
          </button>
          {routeCount > 0 ? (
            <Link href="/admin/facilities/route-builder" className={`${btnSecondary} border-indigo-300 bg-indigo-50 text-indigo-900`}>
              Route Builder ({routeCount})
            </Link>
          ) : null}
          <FacilityAiCaptureButton
            sourceContext="finder"
            currentLatitude={location.status === "ready" ? location.latitude : undefined}
            currentLongitude={location.status === "ready" ? location.longitude : undefined}
            className={btnSecondary}
          />
        </div>

        <label className="block">
          <span className="sr-only">Search facilities</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try "podiatry near me", "wound care Phoenix", "Dr. Smith", "fax 480"…'
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
            autoComplete="off"
          />
        </label>

        {locationHint ? (
          <p className={`text-xs ${location.status === "ready" ? "text-emerald-700" : "text-amber-800"}`}>
            {locationHint}
          </p>
        ) : null}

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setFieldFilter(null)}
            className={fieldFilter === null ? btnChipActive : btnChipIdle}
          >
            All
          </button>
          {FACILITY_FIELD_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFieldFilter(fieldFilter === f.id ? null : f.id)}
              className={fieldFilter === f.id ? btnChipActive : btnChipIdle}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading && results.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Searching facilities…</p>
      ) : null}

      {!loading && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No facilities match</p>
          <p className="mt-1 text-xs text-slate-500">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((f) => (
            <FacilityFinderCard
              key={f.id}
              facility={f}
              inRoute={routeIds.has(f.id)}
              onRouteChange={refreshRouteState}
            />
          ))}
        </div>
      )}

      {results.length > 0 ? (
        <p className="text-center text-xs text-slate-500">
          {loading ? "Updating…" : `${results.length} facilit${results.length === 1 ? "y" : "ies"}`}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/90 md:hidden">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <Link href="/admin/facilities/route-builder" className={`${btnSecondary} w-full border-indigo-300 bg-indigo-50 text-indigo-900`}>
            Route Builder ({routeCount})
          </Link>
          <div className="flex gap-2">
            <Link href="/admin/facilities" className={`${btnSecondary} flex-1`}>
              Admin list
            </Link>
            <button type="button" onClick={requestLocation} className={`${btnPrimary} flex-1`}>
              Near me
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
