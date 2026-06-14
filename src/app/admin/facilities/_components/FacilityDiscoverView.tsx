"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityNearbyExternalCard } from "@/app/admin/facilities/_components/FacilityNearbyExternalCard";
import {
  FacilityRadiusSelect,
  radiusValueToMiles,
  type FacilityRadiusValue,
} from "@/app/admin/facilities/_components/FacilityRadiusSelect";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type {
  DiscoverExternalResult,
  DiscoverPortalResult,
  DiscoverResponse,
} from "@/app/api/facilities/discover/route";
import { crmActionBtnMuted, crmActionBtnSky, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import {
  FACILITY_FIELD_FILTERS,
  type FacilityFieldFilterId,
} from "@/lib/crm/facility-finder-query";
import {
  addExternalPlaceToRouteDraft,
  addFacilityToRouteDraft,
  getFacilityRouteDraftCount,
  isStopInRouteDraft,
  notifyRouteDraftChanged,
  removeStopFromRouteDraft,
  FACILITY_ROUTE_DRAFT_EVENT,
} from "@/lib/crm/facility-route-draft";
import {
  DiscoverQuickAddModal,
  externalResultToQuickAddDraft,
  type QuickAddDraft,
} from "@/app/admin/facilities/_components/DiscoverQuickAddModal";
import { formatFacilitySearchBasisLabel } from "@/lib/crm/facility-location-search";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type SearchScope = "both" | "portal" | "google";

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "denied" | "unavailable" | "error"; message: string };

const btnField =
  "inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.98]";
const btnPrimary = `${btnField} border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sky-200/50`;
const btnSecondary = `${btnField} border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60`;
const btnChip =
  "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]";
const btnChipActive = `${btnChip} border-sky-600 bg-sky-600 text-white shadow-sm`;
const btnChipIdle = `${btnChip} border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50`;
const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-800 shadow-sm";

function MatchBadge({ status }: { status: "already_in_portal" | "possible_match" | "not_in_portal" }) {
  if (status === "already_in_portal") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
        Already in Portal
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
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200">
      Not in Portal
    </span>
  );
}

function SourceBadge({ source }: { source: "saintly_portal" | "google_places" }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
      {source === "saintly_portal" ? "Saintly Portal" : "Google Places"}
    </span>
  );
}

function PortalDiscoverCard({
  item,
  inRoute,
  onRouteChange,
}: {
  item: DiscoverPortalResult;
  inRoute: boolean;
  onRouteChange: () => void;
}) {
  const tel = item.phone?.trim() ? `tel:${item.phone.replace(/[^\d+]/g, "")}` : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: item.formatted_address,
    latitude: item.latitude,
    longitude: item.longitude,
  });

  const toggleRoute = () => {
    if (inRoute) removeStopFromRouteDraft({ facilityId: item.facility_id });
    else addFacilityToRouteDraft(item.facility_id, item.name);
    notifyRouteDraftChanged();
    onRouteChange();
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MatchBadge status="already_in_portal" />
            <SourceBadge source="saintly_portal" />
            {item.distance_miles != null ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                {item.distance_label}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">{[item.type, item.city].filter(Boolean).join(" · ") || "—"}</p>
      <p className="mt-2 text-sm text-slate-700">{item.formatted_address}</p>
      {item.phone ? (
        <p className="mt-1 text-sm text-slate-700">{formatPhoneForDisplay(item.phone)}</p>
      ) : null}
      {item.website ? (
        <a
          href={item.website.startsWith("http") ? item.website : `https://${item.website}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-sm text-sky-800 underline"
        >
          {item.website}
        </a>
      ) : null}
      <div className="mt-4 space-y-3">
        <Link
          href={`/admin/facilities/${item.facility_id}`}
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
            facilityId={item.facility_id}
            facilityName={item.name}
            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
          />
          <FacilityAiCaptureButton
            facilityId={item.facility_id}
            facilityName={item.name}
            sourceContext="discover"
            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
          />
          <button
            type="button"
            onClick={toggleRoute}
            className={`${crmActionBtnMuted} min-h-[2.5rem] ${inRoute ? "border-emerald-300 bg-emerald-50 text-emerald-900" : ""}`}
          >
            {inRoute ? "In route ✓" : "Add to Route"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ExternalDiscoverCard({
  item,
  inRoute,
  onRouteChange,
  onQuickAdd,
  onReviewMatch,
  savedAsPortalId,
}: {
  item: DiscoverExternalResult;
  inRoute: boolean;
  onRouteChange: () => void;
  onQuickAdd: () => void;
  onReviewMatch: () => void;
  savedAsPortalId?: string | null;
}) {
  const effectiveStatus = savedAsPortalId ? "already_in_portal" : item.match_status;
  const tel = item.phone?.trim() ? `tel:${item.phone.replace(/[^\d+]/g, "")}` : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: item.formatted_address,
    latitude: item.latitude,
    longitude: item.longitude,
  });

  const toggleRoute = () => {
    if (savedAsPortalId) {
      if (inRoute) removeStopFromRouteDraft({ facilityId: savedAsPortalId });
      else addFacilityToRouteDraft(savedAsPortalId, item.name);
    } else if (inRoute) {
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
        portalStatus: item.match_status === "possible_match" ? "possible_match" : "not_in_portal",
      });
    }
    notifyRouteDraftChanged();
    onRouteChange();
  };

  const routeIn =
    savedAsPortalId != null
      ? isStopInRouteDraft({ facilityId: savedAsPortalId })
      : inRoute;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MatchBadge status={effectiveStatus} />
            <SourceBadge source="google_places" />
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
      {item.website ? (
        <a
          href={item.website.startsWith("http") ? item.website : `https://${item.website}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-sm text-sky-800 underline"
        >
          {item.website}
        </a>
      ) : null}
      {item.match_reason && effectiveStatus !== "not_in_portal" ? (
        <p className="mt-2 text-xs text-slate-500">{item.match_reason}</p>
      ) : null}

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

        {savedAsPortalId ? (
          <>
            <FacilityQuickLogButton
              facilityId={savedAsPortalId}
              facilityName={item.name}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            />
            <FacilityAiCaptureButton
              facilityId={savedAsPortalId}
              facilityName={item.name}
              sourceContext="discover"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            />
            <Link
              href={`/admin/facilities/${savedAsPortalId}`}
              className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}
            >
              Open
            </Link>
          </>
        ) : effectiveStatus === "not_in_portal" ? (
          <button type="button" onClick={onQuickAdd} className={`${crmActionBtnSky} min-h-[2.5rem]`}>
            Quick Add
          </button>
        ) : (
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
              Create New
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggleRoute}
          className={`${crmActionBtnMuted} min-h-[2.5rem] ${routeIn ? "border-emerald-300 bg-emerald-50 text-emerald-900" : ""}`}
        >
          {routeIn ? "In route ✓" : "Add to Route"}
        </button>
      </div>
    </article>
  );
}

export function FacilityDiscoverView() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [fieldFilter, setFieldFilter] = useState<FacilityFieldFilterId | null>(null);
  const [radius, setRadius] = useState<FacilityRadiusValue>(15);
  const [maxResults, setMaxResults] = useState(20);
  const [searchScope, setSearchScope] = useState<SearchScope>("both");
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(null);
  const [savedPlaceIds, setSavedPlaceIds] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [routeCount, setRouteCount] = useState(0);

  const refreshRouteCount = useCallback(() => {
    setRouteCount(getFacilityRouteDraftCount());
  }, []);

  useEffect(() => {
    refreshRouteCount();
    const handler = () => refreshRouteCount();
    window.addEventListener(FACILITY_ROUTE_DRAFT_EVENT, handler);
    return () => window.removeEventListener(FACILITY_ROUTE_DRAFT_EVENT, handler);
  }, [refreshRouteCount]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({ status: "unavailable", message: "Location is not supported in this browser." });
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
        setLocation({
          status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Location denied. You can still search by city."
              : "Could not get location. Try again or search by city.",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        query,
        city: city.trim() || null,
        field_filter: fieldFilter,
        radius_miles: radiusValueToMiles(radius),
        max_results: maxResults,
        search_scope: searchScope,
      };
      if (location.status === "ready") {
        body.latitude = location.latitude;
        body.longitude = location.longitude;
      }
      const res = await fetch("/api/facilities/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("search_failed");
      const payload = (await res.json()) as DiscoverResponse;
      setData(payload);
    } catch {
      setData({
        portal_results: [],
        external_results: [],
        possible_matches: [],
        normalized_query: {
          query,
          city: city.trim() || null,
          near_me: false,
          field_filter: fieldFilter,
          search_scope: searchScope,
          radius_miles: radiusValueToMiles(radius),
          max_results: maxResults,
        },
        google_places_configured: false,
        errors: ["Network error. Check your connection and try again."],
      });
    } finally {
      setLoading(false);
    }
  }, [query, city, fieldFilter, radius, maxResults, searchScope, location]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() || city.trim() || fieldFilter) void runSearch();
    }, 400);
    return () => window.clearTimeout(t);
  }, [query, city, fieldFilter, radius, maxResults, searchScope, location.status, runSearch]);

  const searchBasisLabel = useMemo(() => {
    if (location.status === "requesting") return "Getting your location…";
    return formatFacilitySearchBasisLabel({
      radiusMiles: location.status === "ready" ? radiusValueToMiles(radius) : null,
      locationAvailable: location.status === "ready",
      city: city.trim() || data?.normalized_query.city || null,
      nearMe: /near me/i.test(query) || Boolean(data?.normalized_query.near_me),
    });
  }, [location, radius, city, query, data?.normalized_query]);

  function handleDiscoverNearMe() {
    if (!/near me/i.test(query)) {
      setQuery((q) => (q.trim() ? `${q.trim()} near me` : "facilities near me"));
    }
    requestLocation();
    void runSearch();
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

  function handleSaved(googlePlaceId: string, facilityId: string, name: string) {
    setSavedPlaceIds((prev) => ({ ...prev, [googlePlaceId]: facilityId }));
    setQuickAddDraft(null);
    showToast(`${name} added — open the facility file to start working it`);
  }

  const googleWarning =
    data && !data.google_places_configured && searchScope !== "portal"
      ? "Google Places is not configured yet. Portal results only."
      : null;

  return (
    <div className="space-y-4 pb-24">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="sticky top-0 z-20 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleDiscoverNearMe} className={btnSecondary}>
            Discover near me
          </button>
          <button type="button" onClick={() => void runSearch()} className={btnPrimary} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          <Link href="/admin/facilities/route-builder" className={`${btnSecondary} border-indigo-300 bg-indigo-50 text-indigo-900`}>
            Route Builder ({routeCount})
          </Link>
        </div>

        <label className="block">
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "podiatry offices in Gilbert", "wound care near me"'
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          City (optional)
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Gilbert, Mesa, Phoenix…"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm"
          />
        </label>

        {searchBasisLabel ? (
          <p className={`text-xs ${location.status === "ready" ? "text-emerald-700" : "text-amber-800"}`}>
            {searchBasisLabel}
            {location.status === "denied" || location.status === "error" || location.status === "unavailable"
              ? ` ${location.message}`
              : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <FacilityRadiusSelect value={radius} onChange={setRadius} />
          <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className={selectCls}>
            <option value={10}>10 results</option>
            <option value={20}>20 results</option>
            <option value={40}>40 results</option>
          </select>
          <select
            value={searchScope}
            onChange={(e) => setSearchScope(e.target.value as SearchScope)}
            className={selectCls}
          >
            <option value="both">Search Both</option>
            <option value="portal">Saintly Portal Only</option>
            <option value="google">Google Places Only</option>
          </select>
        </div>

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

      {googleWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {googleWarning}
        </div>
      ) : null}

      {data?.errors.map((err) => (
        <div key={err} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {err}
        </div>
      ))}

      {loading && !data ? (
        <p className="py-8 text-center text-sm text-slate-500">Searching…</p>
      ) : null}

      {data && data.portal_results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            In Saintly Portal ({data.portal_results.length})
          </h2>
          {data.portal_results.map((item) => (
            <PortalDiscoverCard
              key={item.facility_id}
              item={item}
              inRoute={isStopInRouteDraft({ facilityId: item.facility_id })}
              onRouteChange={refreshRouteCount}
            />
          ))}
        </section>
      ) : null}

      {data && data.external_results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            New Google Results Near You ({data.external_results.length})
          </h2>
          {data.external_results.map((item) => (
            <FacilityNearbyExternalCard
              key={item.google_place_id}
              item={item}
              savedAsPortalId={savedPlaceIds[item.google_place_id] ?? null}
              inRoute={isStopInRouteDraft({ googlePlaceId: item.google_place_id })}
              onRouteChange={refreshRouteCount}
              onQuickAdd={() => setQuickAddDraft(externalResultToQuickAddDraft(item))}
              onReviewMatch={() => setQuickAddDraft(externalResultToQuickAddDraft(item))}
            />
          ))}
        </section>
      ) : null}

      {data && data.possible_matches.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800">
            Possible Matches — review before adding ({data.possible_matches.length})
          </h2>
          {data.possible_matches.map((item) => (
            <FacilityNearbyExternalCard
              key={`possible-${item.google_place_id}`}
              item={item}
              savedAsPortalId={savedPlaceIds[item.google_place_id] ?? null}
              inRoute={isStopInRouteDraft({
                facilityId: savedPlaceIds[item.google_place_id] ?? item.matched_facility_id ?? undefined,
                googlePlaceId: item.google_place_id,
              })}
              onRouteChange={refreshRouteCount}
              onQuickAdd={() => setQuickAddDraft(externalResultToQuickAddDraft(item))}
              onReviewMatch={() => {
                if (item.matched_facility_id) {
                  window.location.href = `/admin/facilities/${item.matched_facility_id}`;
                } else {
                  setQuickAddDraft(externalResultToQuickAddDraft(item));
                }
              }}
            />
          ))}
        </section>
      ) : null}

      {data &&
      !loading &&
      data.portal_results.length === 0 &&
      (data.external_results.length > 0 || data.possible_matches.length > 0) &&
      location.status === "ready" &&
      radius !== "all" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          No portal facilities found within {radius} miles.
        </div>
      ) : null}

      {data &&
      !loading &&
      data.portal_results.length === 0 &&
      data.external_results.length === 0 &&
      data.possible_matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No results yet</p>
          <p className="mt-1 text-xs text-slate-500">Try a search like “podiatry offices in Gilbert.”</p>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <Link href="/admin/facilities/route-builder" className={`${btnSecondary} w-full`}>
            Route Builder ({routeCount})
          </Link>
          <div className="flex gap-2">
            <Link href="/admin/facilities/finder" className={`${btnSecondary} flex-1`}>
              Finder
            </Link>
            <button type="button" onClick={() => void runSearch()} className={`${btnPrimary} flex-1`}>
              Search
            </button>
          </div>
        </div>
      </div>

      {quickAddDraft ? (
        <DiscoverQuickAddModal
          draft={quickAddDraft}
          onClose={() => setQuickAddDraft(null)}
          onSaved={(facilityId, name) =>
            handleSaved(quickAddDraft.google_place_id, facilityId, name)
          }
          onUseExisting={(facilityId) => {
            setQuickAddDraft(null);
            window.location.href = `/admin/facilities/${facilityId}`;
          }}
        />
      ) : null}
    </div>
  );
}
