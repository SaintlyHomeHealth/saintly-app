"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FacilityQuickAddModal,
  routeStopToQuickAddDraft,
  type QuickAddDraft,
} from "@/app/admin/facilities/_components/DiscoverQuickAddModal";
import { FacilitySaveRoutePlanModal } from "@/app/admin/facilities/_components/FacilitySaveRoutePlanModal";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { RouteBuilderEnrichedFacility } from "@/app/api/facilities/route-builder/enrich/route";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import {
  enrichStopsWithNumbers,
  findNextPendingStopIndex,
  formatRouteListForCopy,
  sortStopsByDistance,
  sortStopsRecommended,
  type EnrichedRouteStop,
} from "@/lib/crm/facility-route-builder";
import {
  clearFacilityRouteDraft,
  loadFacilityRouteDraftWithMeta,
  mergeEnrichedPortalFields,
  moveStopInRoute,
  notifyRouteDraftChanged,
  promoteStopToPortal,
  removeStopByLocalId,
  reverseRouteDraftOrder,
  setRouteDraftStops,
  updateStopVisitState,
  FACILITY_ROUTE_DRAFT_EVENT,
  type FacilityRouteDraftStop,
} from "@/lib/crm/facility-route-draft";
import { type GeoPoint } from "@/lib/crm/facility-geolocation";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "denied" | "unavailable" | "error"; message: string };

const btnField =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.98]";
const btnPrimary = `${btnField} border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white`;
const btnSecondary = `${btnField} border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60`;
const btnDanger = `${btnField} border-red-200 bg-red-50 text-red-800`;

function StopBadge({ stop }: { stop: FacilityRouteDraftStop }) {
  if (stop.visitState === "visited") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
        Visited
      </span>
    );
  }
  if (stop.visitState === "skipped") {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
        Skipped
      </span>
    );
  }
  if (stop.facilityId || stop.portalStatus === "already_in_portal") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900 ring-1 ring-emerald-200">
        In Portal
      </span>
    );
  }
  if (stop.portalStatus === "possible_match") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-950 ring-1 ring-amber-200">
        Possible Match
      </span>
    );
  }
  if (stop.source === "google_places") {
    return (
      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-900 ring-1 ring-violet-200">
        Google Place
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-900 ring-1 ring-sky-200">
      Not Added Yet
    </span>
  );
}

function RouteStopCard({
  stop,
  isFirst,
  isLast,
  onChange,
  onQuickAdd,
  showOpenNext,
  onOpenNext,
}: {
  stop: EnrichedRouteStop;
  isFirst: boolean;
  isLast: boolean;
  onChange: () => void;
  onQuickAdd: (draft: QuickAddDraft) => void;
  showOpenNext: boolean;
  onOpenNext: () => void;
}) {
  const inPortal = Boolean(stop.facilityId || stop.portalStatus === "already_in_portal");
  const tel = stop.phone?.trim() ? `tel:${stop.phone.replace(/[^\d+]/g, "")}` : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
  });

  const dimmed = stop.visitState === "visited" || stop.visitState === "skipped";

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Stop {stop.stopNumber}
          </p>
          <h3 className="text-base font-semibold text-slate-900">{stop.name || "Unnamed stop"}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StopBadge stop={stop} />
            {stop.distanceMiles != null ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {stop.distanceLabel}
              </span>
            ) : null}
            {stop.type ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {stop.type}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {stop.address ? <p className="mt-2 text-sm text-slate-700">{stop.address}</p> : null}
      {stop.phone ? (
        <p className="mt-1 text-sm text-slate-700">{formatPhoneForDisplay(stop.phone)}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-slate-500">
        Source: {stop.source === "google_places" ? "Google Places" : "Saintly Portal"}
      </p>

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

        {inPortal && stop.facilityId ? (
          <>
            <Link href={`/admin/facilities/${stop.facilityId}`} className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}>
              Open
            </Link>
            <FacilityQuickLogButton
              facilityId={stop.facilityId}
              facilityName={stop.name}
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            />
            <FacilityAiCaptureButton
              facilityId={stop.facilityId}
              facilityName={stop.name}
              sourceContext="route_builder"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
            />
            <FacilityPhotoNoteButton
              facilityId={stop.facilityId}
              facilityName={stop.name}
              sourceContext="route_builder"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[10px] leading-tight`}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                const draft = routeStopToQuickAddDraft(stop);
                if (draft) onQuickAdd(draft);
              }}
              className={`${crmActionBtnSky} min-h-[2.5rem]`}
            >
              Quick Add
            </button>
            <span
              className={`${crmActionBtnMuted} min-h-[2.5rem] cursor-not-allowed text-center text-[10px] leading-tight opacity-60`}
              title="Add to portal before logging"
            >
              Quick Log (add first)
            </span>
            <FacilityAiCaptureButton
              disabled
              disabledTitle="Quick Add to portal before AI Capture"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[10px] leading-tight`}
            />
            <FacilityPhotoNoteButton
              disabled
              disabledTitle="Quick Add to portal before uploading photos"
              className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[10px] leading-tight`}
            />
          </>
        )}

        <button
          type="button"
          onClick={() => {
            if (!stop.localId) return;
            removeStopByLocalId(stop.localId);
            notifyRouteDraftChanged();
            onChange();
          }}
          className={`${crmActionBtnMuted} min-h-[2.5rem] text-red-800`}
        >
          Remove
        </button>
        <button
          type="button"
          disabled={isFirst || !stop.localId}
          onClick={() => {
            if (!stop.localId) return;
            moveStopInRoute(stop.localId, "up");
            notifyRouteDraftChanged();
            onChange();
          }}
          className={`${crmActionBtnMuted} min-h-[2.5rem] disabled:opacity-40`}
        >
          Move Up
        </button>
        <button
          type="button"
          disabled={isLast || !stop.localId}
          onClick={() => {
            if (!stop.localId) return;
            moveStopInRoute(stop.localId, "down");
            notifyRouteDraftChanged();
            onChange();
          }}
          className={`${crmActionBtnMuted} min-h-[2.5rem] disabled:opacity-40`}
        >
          Move Down
        </button>

        {stop.visitState !== "visited" && stop.localId ? (
          <button
            type="button"
            onClick={() => {
              updateStopVisitState(stop.localId, "visited");
              notifyRouteDraftChanged();
              onChange();
            }}
            className={`${crmActionBtnMuted} min-h-[2.5rem] border-emerald-200 bg-emerald-50 text-emerald-900`}
          >
            Mark Visited
          </button>
        ) : null}

        {stop.visitState === "skipped" && stop.localId ? (
          <button
            type="button"
            onClick={() => {
              updateStopVisitState(stop.localId, "pending");
              notifyRouteDraftChanged();
              onChange();
            }}
            className={`${crmActionBtnMuted} min-h-[2.5rem]`}
          >
            Unskip
          </button>
        ) : stop.visitState !== "visited" && stop.localId ? (
          <button
            type="button"
            onClick={() => {
              updateStopVisitState(stop.localId, "skipped");
              notifyRouteDraftChanged();
              onChange();
            }}
            className={`${crmActionBtnMuted} min-h-[2.5rem]`}
          >
            Skip
          </button>
        ) : null}
      </div>

      {showOpenNext && stop.visitState === "visited" ? (
        <button type="button" onClick={onOpenNext} className={`${btnPrimary} mt-3 w-full`}>
          Open Next Stop
        </button>
      ) : null}
    </article>
  );
}

export function FacilityRouteBuilderView({
  currentUserId,
  staffOptions = [],
  canAssignOthers = false,
}: {
  currentUserId?: string;
  staffOptions?: Array<{ user_id: string; label: string }>;
  canAssignOthers?: boolean;
} = {}) {
  const [stops, setStops] = useState<FacilityRouteDraftStop[]>([]);
  const [draftCorrupt, setDraftCorrupt] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(null);
  const [quickAddLocalId, setQuickAddLocalId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSavePlan, setShowSavePlan] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const origin: GeoPoint | null =
    location.status === "ready"
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;

  const reloadStops = useCallback(() => {
    const { draft, corrupt, skippedInvalid } = loadFacilityRouteDraftWithMeta();
    setStops(draft.stops);
    setDraftCorrupt(corrupt || (skippedInvalid > 0 && draft.stops.length === 0));
  }, []);

  const enrichPortalStops = useCallback(async (currentStops: FacilityRouteDraftStop[]) => {
    const ids = [
      ...new Set(
        currentStops.filter((s) => s.facilityId).map((s) => s.facilityId as string)
      ),
    ];
    if (ids.length === 0) return;

    setEnriching(true);
    try {
      const res = await fetch("/api/facilities/route-builder/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility_ids: ids }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        facilities: Record<string, RouteBuilderEnrichedFacility>;
      };
      const map: Record<
        string,
        {
          address?: string;
          phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          type?: string | null;
          priority?: string | null;
          nextFollowUpAt?: string | null;
        }
      > = {};
      for (const [id, f] of Object.entries(data.facilities ?? {})) {
        map[id] = {
          address: f.address,
          phone: f.phone,
          latitude: f.latitude,
          longitude: f.longitude,
          type: f.type,
          priority: f.priority,
          nextFollowUpAt: f.nextFollowUpAt,
        };
      }
      mergeEnrichedPortalFields(map);
      notifyRouteDraftChanged();
      reloadStops();
    } finally {
      setEnriching(false);
    }
  }, [reloadStops]);

  useEffect(() => {
    reloadStops();
    const handler = () => reloadStops();
    window.addEventListener(FACILITY_ROUTE_DRAFT_EVENT, handler);
    return () => window.removeEventListener(FACILITY_ROUTE_DRAFT_EVENT, handler);
  }, [reloadStops]);

  useEffect(() => {
    if (stops.length > 0) void enrichPortalStops(stops);
  }, [stops.length]); // eslint-disable-line react-hooks/exhaustive-deps -- enrich once when stops load

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({ status: "unavailable", message: "Location not supported" });
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
              ? "Location denied — address-only directions still work"
              : "Could not get location",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const enrichedStops = useMemo(
    () => enrichStopsWithNumbers(stops, origin),
    [stops, origin]
  );

  const activeStops = enrichedStops.filter((s) => s.visitState !== "visited");
  const completedStops = enrichedStops.filter((s) => s.visitState === "visited");

  const firstPendingStop = enrichedStops.find(
    (s) => s.visitState !== "visited" && s.visitState !== "skipped"
  );

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  function openStopInMaps(stop: FacilityRouteDraftStop) {
    const url = appleMapsDirectionsUrl({
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
    });
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleCopyRoute() {
    try {
      void navigator.clipboard.writeText(formatRouteListForCopy(stops));
      showToast("Route copied.");
    } catch {
      showToast("Could not copy — try again.");
    }
  }

  function handleSortByDistance() {
    if (!origin) {
      showToast("Enable location to sort by distance.");
      requestLocation();
      return;
    }
    setRouteDraftStops(sortStopsByDistance(stops, origin));
    notifyRouteDraftChanged();
    reloadStops();
    showToast("Sorted by distance.");
  }

  function handleRecommendedOrder() {
    if (!origin) {
      showToast("Enable location for recommended order.");
      requestLocation();
      return;
    }
    setRouteDraftStops(sortStopsRecommended(stops, origin));
    notifyRouteDraftChanged();
    reloadStops();
    showToast("Applied recommended order.");
  }

  function handleClearRoute() {
    clearFacilityRouteDraft();
    notifyRouteDraftChanged();
    reloadStops();
    setShowClearConfirm(false);
    setDraftCorrupt(false);
    showToast("Route cleared.");
  }

  function handleClearCorruptDraft() {
    clearFacilityRouteDraft();
    notifyRouteDraftChanged();
    reloadStops();
    setDraftCorrupt(false);
    showToast("Route draft cleared.");
  }

  function handleQuickAddSaved(facilityId: string, name: string) {
    if (quickAddLocalId) {
      promoteStopToPortal(quickAddLocalId, facilityId, name);
      notifyRouteDraftChanged();
      reloadStops();
    }
    setQuickAddDraft(null);
    setQuickAddLocalId(null);
    showToast(`${name} added to portal`);
  }

  const locationLabel = useMemo(() => {
    if (location.status === "requesting") return "Getting location…";
    if (location.status === "ready") return "Location enabled";
    if (location.status === "denied") return "Location denied";
    if (location.status === "error" || location.status === "unavailable") return location.message;
    return "Location not set";
  }, [location]);

  const totalDistance = activeStops.reduce((sum, s) => sum + (s.distanceMiles ?? 0), 0);

  return (
    <div className="space-y-4 pb-32">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {draftCorrupt ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-sm font-semibold text-amber-950">
            Your route draft could not be loaded. Clear draft and start again.
          </p>
          <button type="button" onClick={handleClearCorruptDraft} className={`${btnDanger} mt-3`}>
            Clear Draft
          </button>
        </section>
      ) : null}

      {/* Location */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Current location</h2>
            <p
              className={`mt-1 text-xs ${location.status === "ready" ? "text-emerald-700" : "text-amber-800"}`}
            >
              {locationLabel}
            </p>
          </div>
          <button type="button" onClick={requestLocation} className={btnSecondary}>
            Use My Location
          </button>
        </div>
      </section>

      {/* Summary */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Route summary</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">Total stops</span>
            <p className="font-bold text-slate-900">{stops.length}</p>
          </div>
          <div>
            <span className="text-slate-500">Remaining</span>
            <p className="font-bold text-slate-900">
              {stops.filter((s) => s.visitState !== "visited" && s.visitState !== "skipped").length}
            </p>
          </div>
          {origin && activeStops.some((s) => s.distanceMiles != null) ? (
            <div className="col-span-2">
              <span className="text-slate-500">Approx. distance to active stops</span>
              <p className="font-bold text-slate-900">{totalDistance.toFixed(1)} mi (straight-line)</p>
            </div>
          ) : null}
        </div>
        {enriching ? <p className="mt-2 text-xs text-slate-500">Loading facility details…</p> : null}
      </section>

      {/* Sort controls */}
      {stops.length > 0 ? (
        <section className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSortByDistance} className={btnSecondary}>
            Sort by Distance
          </button>
          <button type="button" onClick={handleRecommendedOrder} className={btnSecondary}>
            Recommended Order
          </button>
          <button
            type="button"
            onClick={() => {
              reverseRouteDraftOrder();
              notifyRouteDraftChanged();
              reloadStops();
            }}
            className={btnSecondary}
          >
            Reverse Order
          </button>
        </section>
      ) : null}

      {/* Empty state */}
      {stops.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-800">No stops added yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Add facilities from Finder or Discovery, then plan your route here.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/admin/facilities/finder" className={btnPrimary}>
              Find Facilities Near Me
            </Link>
            <Link href="/admin/facilities/discover" className={btnSecondary}>
              Discover New Facilities
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Your route</h2>
            {enrichedStops.map((stop, idx) => {
              const hasNextPending = findNextPendingStopIndex(stops) >= 0;
              return (
                <RouteStopCard
                  key={stop.localId || `stop-${idx}`}
                  stop={stop}
                  isFirst={idx === 0}
                  isLast={idx === enrichedStops.length - 1}
                  onChange={reloadStops}
                  onQuickAdd={(draft) => {
                    setQuickAddLocalId(stop.localId);
                    setQuickAddDraft(draft);
                  }}
                  showOpenNext={stop.visitState === "visited" && hasNextPending}
                  onOpenNext={() => {
                    const fresh = loadFacilityRouteDraftWithMeta().draft.stops;
                    const ni = findNextPendingStopIndex(fresh);
                    if (ni < 0) return;
                    openStopInMaps(fresh[ni]);
                  }}
                />
              );
            })}
          </section>

          {completedStops.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Completed</h2>
              {completedStops.map((stop) => (
                <div
                  key={`done-${stop.localId}`}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600"
                >
                  ✓ {stop.name}
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}

      {/* Sticky actions */}
      {stops.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(15,23,42,0.1)] backdrop-blur">
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!firstPendingStop}
                onClick={() => firstPendingStop && openStopInMaps(firstPendingStop)}
                className={`${btnPrimary} disabled:opacity-50`}
              >
                Open First Stop
              </button>
              <button type="button" onClick={handleCopyRoute} className={btnSecondary}>
                Copy Route List
              </button>
            </div>
            {currentUserId ? (
              <button type="button" onClick={() => setShowSavePlan(true)} className={btnSecondary}>
                Save Route Plan
              </button>
            ) : null}
            <RoutesNavLink className={`${btnSecondary} w-full text-center`} />
            <button type="button" onClick={() => setShowClearConfirm(true)} className={btnDanger}>
              Clear Route
            </button>
          </div>
        </div>
      ) : null}

      {showClearConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-base font-semibold text-slate-900">Clear all stops from this route?</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setShowClearConfirm(false)} className={`${btnSecondary} flex-1`}>
                Cancel
              </button>
              <button type="button" onClick={handleClearRoute} className={`${btnDanger} flex-1`}>
                Clear Route
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickAddDraft ? (
        <FacilityQuickAddModal
          draft={quickAddDraft}
          onClose={() => {
            setQuickAddDraft(null);
            setQuickAddLocalId(null);
          }}
          onSaved={handleQuickAddSaved}
          onUseExisting={(facilityId) => {
            if (quickAddLocalId) {
              promoteStopToPortal(quickAddLocalId, facilityId);
              notifyRouteDraftChanged();
              reloadStops();
            }
            setQuickAddDraft(null);
            setQuickAddLocalId(null);
            window.location.href = `/admin/facilities/${facilityId}`;
          }}
        />
      ) : null}

      {currentUserId ? (
        <FacilitySaveRoutePlanModal
          open={showSavePlan}
          onClose={() => setShowSavePlan(false)}
          currentUserId={currentUserId}
          staffOptions={staffOptions}
          canAssignOthers={canAssignOthers}
          startLatitude={origin?.latitude ?? null}
          startLongitude={origin?.longitude ?? null}
          onSaved={() => showToast("Route plan saved.")}
        />
      ) : null}
    </div>
  );
}
