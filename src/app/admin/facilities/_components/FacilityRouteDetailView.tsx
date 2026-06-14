"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FacilityQuickAddModal,
  type QuickAddDraft,
} from "@/app/admin/facilities/_components/DiscoverQuickAddModal";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { ShowReferralQrButton } from "@/app/admin/facilities/_components/ShowReferralQrButton";
import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";
import { FacilitySkipStopModal } from "@/app/admin/facilities/_components/FacilitySkipStopModal";
import { useFacilityOfflineQueue } from "@/app/admin/facilities/_components/useFacilityOfflineQueue";
import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";
import type { RoutePlanDetail, RouteStopCard } from "@/lib/crm/facility-route-types";
import { ROUTE_PLAN_STATUS_LABELS, ROUTE_STOP_STATUS_LABELS } from "@/lib/crm/facility-route-types";
import { effectiveStopStatus } from "@/lib/crm/facility-offline-route-helpers";
import { enqueueOfflineItem, initOfflineQueueUser } from "@/lib/crm/facility-offline-queue";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { formatRouteListForCopy } from "@/lib/crm/facility-route-builder";
import { haversineDistanceMiles, formatDistanceMiles } from "@/lib/crm/facility-geolocation";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type FacilityRouteDetailViewProps = {
  routeId: string;
  canManageAll: boolean;
  currentUserId?: string;
};

function stopBadge(stop: RouteStopCard): { label: string; cls: string } {
  if (stop.facility_id || stop.portal_status === "already_in_portal") {
    return { label: "In Portal", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" };
  }
  if (stop.google_place_id) return { label: "Google Place", cls: "bg-violet-50 text-violet-900 ring-violet-200" };
  return { label: "Not Added Yet", cls: "bg-amber-50 text-amber-900 ring-amber-200" };
}

function routeStopToQuickAddDraft(stop: RouteStopCard): QuickAddDraft {
  return {
    google_place_id: stop.google_place_id ?? "",
    name: stop.name,
    address_line_1: stop.address ?? "",
    city: "",
    state: "",
    zip: "",
    formatted_address: stop.address ?? "",
    main_phone: stop.phone ?? "",
    website: "",
    type: "",
    latitude: stop.latitude,
    longitude: stop.longitude,
    notes: stop.notes ?? "",
  };
}

export function FacilityRouteDetailView({ routeId, canManageAll, currentUserId }: FacilityRouteDetailViewProps) {
  const { isOnline } = useFacilityOnlineStatus();
  const { items, pendingForRoute } = useFacilityOfflineQueue(currentUserId);
  const routePendingCount = pendingForRoute(routeId);

  useEffect(() => {
    if (currentUserId) initOfflineQueueUser(currentUserId);
  }, [currentUserId]);
  const [route, setRoute] = useState<RoutePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [quickLogStop, setQuickLogStop] = useState<RouteStopCard | null>(null);
  const [completePromptStop, setCompletePromptStop] = useState<RouteStopCard | null>(null);
  const [skipStop, setSkipStop] = useState<RouteStopCard | null>(null);
  const [quickAddStop, setQuickAddStop] = useState<RouteStopCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/routes/${routeId}`);
      const data = (await res.json()) as { ok: boolean; route?: RoutePlanDetail };
      if (!data.ok || !data.route) {
        setError("Route not found.");
        return;
      }
      setRoute(data.route);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60_000 }
    );
  }, []);

  const progress = useMemo(() => {
    if (!route) return { done: 0, total: 0 };
    const done = route.stops.filter((s) => s.status === "completed" || s.status === "skipped").length;
    return { done, total: route.stops.length };
  }, [route]);

  async function startRoute() {
    const body: Record<string, unknown> = {};
    if (userLocation) {
      body.latitude = userLocation.latitude;
      body.longitude = userLocation.longitude;
    }
    await fetch(`/api/facilities/routes/${routeId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function completeRoute() {
    await fetch(`/api/facilities/routes/${routeId}/complete`, { method: "POST", body: "{}" });
    await load();
  }

  async function checkIn(stop: RouteStopCard) {
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      setToast("Checked in without location.");
    }

    if (lat != null && lng != null && stop.latitude != null && stop.longitude != null) {
      const miles = haversineDistanceMiles({ latitude: lat, longitude: lng }, { latitude: stop.latitude, longitude: stop.longitude });
      if (miles > 0.25) {
        const ok = window.confirm("You appear to be away from this facility. Continue check-in?");
        if (!ok) return;
      }
    }

    if (!isOnline && currentUserId) {
      await enqueueOfflineItem({
        type: "route_check_in",
        user_id: currentUserId,
        payload: { latitude: lat, longitude: lng, checked_in_at: new Date().toISOString() },
        related_facility_id: stop.facility_id,
        related_route_id: routeId,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Checked in — pending sync");
      return;
    }

    const res = await fetch(`/api/facilities/routes/${routeId}/stops/${stop.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
    if (!res.ok && currentUserId) {
      await enqueueOfflineItem({
        type: "route_check_in",
        user_id: currentUserId,
        payload: { latitude: lat, longitude: lng, checked_in_at: new Date().toISOString() },
        related_facility_id: stop.facility_id,
        related_route_id: routeId,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Check-in saved to pending sync.");
      return;
    }
    const data = (await res.json()) as { ok?: boolean; warning?: string };
    if (data.ok) setToast(data.warning === "away_from_facility" ? "Checked in (away from facility)." : "Checked in.");
    await load();
  }

  async function completeStop(stop: RouteStopCard, activityId?: string | null) {
    const payload = { linked_activity_id: activityId ?? stop.linked_activity_id };

    if (!isOnline && currentUserId) {
      await enqueueOfflineItem({
        type: "route_stop_complete",
        user_id: currentUserId,
        payload,
        related_facility_id: stop.facility_id,
        related_route_id: routeId,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Stop completion queued for sync.");
      setCompletePromptStop(null);
      setQuickLogStop(null);
      return;
    }

    const res = await fetch(`/api/facilities/routes/${routeId}/stops/${stop.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok && currentUserId) {
      await enqueueOfflineItem({
        type: "route_stop_complete",
        user_id: currentUserId,
        payload,
        related_facility_id: stop.facility_id,
        related_route_id: routeId,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Stop completion saved to pending sync.");
      setCompletePromptStop(null);
      setQuickLogStop(null);
      return;
    }
    setCompletePromptStop(null);
    setQuickLogStop(null);
    await load();
  }

  function handleCompleteClick(stop: RouteStopCard) {
    if (!stop.linked_activity_id) {
      setCompletePromptStop(stop);
      return;
    }
    void completeStop(stop);
  }

  async function handleQuickAddSaved(facilityId: string) {
    if (!quickAddStop) return;
    await fetch(`/api/facilities/routes/${routeId}/stops/${quickAddStop.id}/quick-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_existing_facility_id: facilityId }),
    });
    setQuickAddStop(null);
    await load();
  }

  if (loading) return <p className="text-sm text-slate-600">Loading route…</p>;
  if (error || !route) return <p className="text-sm text-red-700">{error ?? "Not found."}</p>;

  const nextPending = route.stops.find((s) => s.status === "pending" || s.status === "checked_in");
  const inPortal = (s: RouteStopCard) => Boolean(s.facility_id);

  return (
    <div className="space-y-4 pb-24">
      <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{route.name}</h2>
            <p className="text-sm text-slate-600">
              {route.route_date} · {route.assigned_rep_label ?? "Unassigned"}
            </p>
            <p className="mt-1 text-xs text-teal-800">
              {ROUTE_PLAN_STATUS_LABELS[route.status]} · {progress.done}/{progress.total} stops done
              {routePendingCount > 0 ? ` · ${routePendingCount} pending sync` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FieldModeNavLink className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 sm:text-sm" />
            {route.status === "planned" || route.status === "draft" ? (
              <button type="button" onClick={() => void startRoute()} className={crmActionBtnSky}>
                Start Route
              </button>
            ) : null}
            {route.status === "in_progress" ? (
              <button type="button" onClick={() => void startRoute()} className={crmActionBtnMuted}>
                Continue Route
              </button>
            ) : null}
            {route.status === "in_progress" ? (
              <button type="button" onClick={() => void completeRoute()} className={crmActionBtnSky}>
                Complete Route
              </button>
            ) : null}
            {canManageAll && route.status !== "completed" && route.status !== "canceled" ? (
              <button
                type="button"
                className={`${crmActionBtnMuted} text-rose-800`}
                onClick={() => void fetch(`/api/facilities/routes/${routeId}/cancel`, { method: "POST", body: "{}" }).then(() => load())}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className={crmActionBtnMuted}
              onClick={() =>
                void navigator.clipboard.writeText(
                  formatRouteListForCopy(
                    route.stops.map((s, i) => ({
                      localId: String(i),
                      name: s.name,
                      address: s.address ?? undefined,
                      addedAt: new Date().toISOString(),
                    }))
                  )
                )
              }
            >
              Copy Route List
            </button>
          </div>
        </div>
        {nextPending ? (
          <p className="mt-2 text-sm text-slate-700">
            Next stop: <strong>{nextPending.name}</strong>
          </p>
        ) : null}
      </section>

      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{toast}</div>
      ) : null}

      <section className="space-y-3">
        {route.stops.map((stop) => {
          const badge = stopBadge(stop);
          const stopEff = effectiveStopStatus(stop, items);
          const tel = stop.phone?.trim() ? `tel:${stop.phone.replace(/[^\d+]/g, "")}` : null;
          const mapsUrl = appleMapsDirectionsUrl({ address: stop.address ?? undefined, latitude: stop.latitude, longitude: stop.longitude });
          const distance =
            userLocation && stop.latitude != null && stop.longitude != null
              ? formatDistanceMiles(
                  haversineDistanceMiles(userLocation, { latitude: stop.latitude, longitude: stop.longitude })
                )
              : null;

          return (
            <article key={stop.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Stop {stop.stop_order}</p>
                  <h3 className="text-base font-semibold text-slate-900">
                    {stop.facility_id ? (
                      <Link href={`/admin/facilities/${stop.facility_id}`} className="hover:text-teal-800">
                        {stop.name}
                      </Link>
                    ) : (
                      stop.name
                    )}
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${badge.cls}`}>{badge.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {ROUTE_STOP_STATUS_LABELS[stop.status]}
                      {stopEff.pendingCheckIn ? " — pending sync" : ""}
                    </span>
                  </div>
                  {stop.address ? <p className="mt-1 text-sm text-slate-600">{stop.address}</p> : null}
                  {stop.phone ? <p className="text-sm text-slate-600">{formatPhoneForDisplay(stop.phone)}</p> : null}
                  {distance ? <p className="text-xs text-slate-500">{distance} away</p> : null}
                  {stop.checked_in_at ? (
                    <p className="text-xs text-slate-500">Checked in {new Date(stop.checked_in_at).toLocaleTimeString()}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className={crmActionBtnSky}>
                    Directions
                  </a>
                ) : null}
                {tel ? (
                  <a href={tel} className={crmActionBtnMuted}>
                    Call
                  </a>
                ) : null}
                {stop.status !== "completed" && stop.status !== "skipped" ? (
                  <button type="button" className={crmActionBtnMuted} onClick={() => void checkIn(stop)}>
                    Check In
                  </button>
                ) : null}
                {inPortal(stop) ? (
                  <>
                    <button type="button" className={crmActionBtnMuted} onClick={() => setQuickLogStop(stop)}>
                      Quick Log
                    </button>
                    <FacilityAiCaptureButton facilityId={stop.facility_id!} facilityName={stop.name} className={crmActionBtnMuted} />
                    <FacilityPhotoNoteButton facilityId={stop.facility_id!} facilityName={stop.name} className={crmActionBtnMuted} />
                    <ShowReferralQrButton
                      facilityId={stop.facility_id}
                      facilityName={stop.name}
                      className={crmActionBtnMuted}
                      showCopy={false}
                    />
                  </>
                ) : (
                  <>
                    <button type="button" className={crmActionBtnMuted} onClick={() => setQuickAddStop(stop)}>
                      Quick Add
                    </button>
                    <ShowReferralQrButton className={crmActionBtnMuted} fallbackToUniversal showCopy={false} />
                  </>
                )}
                {stop.status !== "completed" && stop.status !== "skipped" ? (
                  <>
                    <button type="button" className={crmActionBtnSky} onClick={() => handleCompleteClick(stop)}>
                      Complete Stop
                    </button>
                    <button type="button" className={`${crmActionBtnMuted} text-rose-800`} onClick={() => setSkipStop(stop)}>
                      Skip
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {completePromptStop ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-base font-semibold text-slate-900">Quick Log this visit before completing?</p>
            <div className="mt-4 flex flex-col gap-2">
              {completePromptStop.facility_id ? (
                <button type="button" className={crmActionBtnSky} onClick={() => setQuickLogStop(completePromptStop)}>
                  Quick Log
                </button>
              ) : null}
              <button type="button" className={crmActionBtnMuted} onClick={() => void completeStop(completePromptStop)}>
                Complete Without Log
              </button>
              <button type="button" className={crmActionBtnMuted} onClick={() => setCompletePromptStop(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickLogStop?.facility_id ? (
        <FacilityQuickLogModal
          facilityId={quickLogStop.facility_id}
          facilityName={quickLogStop.name}
          userId={currentUserId}
          relatedRouteId={routeId}
          relatedStopId={quickLogStop.id}
          open
          onClose={() => setQuickLogStop(null)}
          onActivitySaved={(activityId) => {
            void completeStop(quickLogStop, activityId);
          }}
        />
      ) : null}

      {skipStop ? (
        <FacilitySkipStopModal
          open
          onClose={() => setSkipStop(null)}
          onConfirm={async ({ skip_reason, notes }) => {
            if (!isOnline && currentUserId) {
              await enqueueOfflineItem({
                type: "route_stop_skip",
                user_id: currentUserId,
                payload: { skip_reason, notes },
                related_facility_id: skipStop.facility_id,
                related_route_id: routeId,
                related_stop_id: skipStop.id,
                facility_name: skipStop.name,
              });
              setToast("Skip queued for sync.");
              setSkipStop(null);
              return;
            }
            const res = await fetch(`/api/facilities/routes/${routeId}/stops/${skipStop.id}/skip`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ skip_reason, notes }),
            });
            if (!res.ok && currentUserId) {
              await enqueueOfflineItem({
                type: "route_stop_skip",
                user_id: currentUserId,
                payload: { skip_reason, notes },
                related_facility_id: skipStop.facility_id,
                related_route_id: routeId,
                related_stop_id: skipStop.id,
                facility_name: skipStop.name,
              });
              setToast("Skip saved to pending sync.");
            }
            setSkipStop(null);
            await load();
          }}
        />
      ) : null}

      {quickAddStop ? (
        <FacilityQuickAddModal
          draft={routeStopToQuickAddDraft(quickAddStop)}
          onClose={() => setQuickAddStop(null)}
          onSaved={(facilityId) => {
            void handleQuickAddSaved(facilityId);
          }}
          onUseExisting={(facilityId) => {
            void handleQuickAddSaved(facilityId);
          }}
        />
      ) : null}
    </div>
  );
}
