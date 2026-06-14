"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityBeforeWalkInCard } from "@/app/admin/facilities/_components/FacilityBeforeWalkInCard";
import { FacilityAiCaptureModal } from "@/app/admin/facilities/_components/FacilityAiCaptureModal";
import { FacilityOfflineStatusBar } from "@/app/admin/facilities/_components/FacilityOfflineStatusBar";
import { FacilityPendingSyncPanel } from "@/app/admin/facilities/_components/FacilityPendingSyncPanel";
import {
  FacilityPickerModal,
  type FacilityPickerItem,
} from "@/app/admin/facilities/_components/FacilityPickerModal";
import { FacilityPhotoUploadModal } from "@/app/admin/facilities/_components/FacilityPhotoWorkflow";
import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";
import { FacilitySkipStopModal } from "@/app/admin/facilities/_components/FacilitySkipStopModal";
import { ShowReferralQrButton } from "@/app/admin/facilities/_components/ShowReferralQrButton";
import { useFacilityOfflineQueue } from "@/app/admin/facilities/_components/useFacilityOfflineQueue";
import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { haversineDistanceMiles, formatDistanceMiles } from "@/lib/crm/facility-geolocation";
import {
  effectiveStopStatus,
} from "@/lib/crm/facility-offline-route-helpers";
import {
  enqueueOfflineItem,
  initOfflineQueueUser,
  type OfflineQueueItem,
} from "@/lib/crm/facility-offline-queue";
import { syncOfflineQueue, retryOfflineQueueItem } from "@/lib/crm/facility-offline-sync";
import { ROUTE_STOP_STATUS_LABELS, type RoutePlanDetail, type RouteStopCard } from "@/lib/crm/facility-route-types";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

const btnLarge =
  "flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl border px-4 py-3.5 text-base font-semibold shadow-sm transition active:scale-[0.98]";
const btnPrimary = `${btnLarge} border-transparent bg-gradient-to-r from-emerald-600 to-teal-500 text-white`;
const btnSecondary = `${btnLarge} border-slate-200 bg-white text-slate-800`;

type FacilityFieldModeViewProps = {
  currentUserId: string;
};

export function FacilityFieldModeView({ currentUserId }: FacilityFieldModeViewProps) {
  const { items, pendingCount, lastSyncAt, refresh, pendingForRoute } = useFacilityOfflineQueue(currentUserId);
  const { isOnline, wasOffline, clearWasOffline } = useFacilityOnlineStatus();

  const [activeRoute, setActiveRoute] = useState<RoutePlanDetail | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [userMismatch, setUserMismatch] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"quick_log" | "photo_note" | "ai_capture" | null>(null);
  const [pickedFacility, setPickedFacility] = useState<FacilityPickerItem | null>(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [aiCaptureOpen, setAiCaptureOpen] = useState(false);
  const [aiCaptureDefaultText, setAiCaptureDefaultText] = useState("");
  const [selectedStop, setSelectedStop] = useState<RouteStopCard | null>(null);
  const [skipStop, setSkipStop] = useState<RouteStopCard | null>(null);
  const [completePromptStop, setCompletePromptStop] = useState<RouteStopCard | null>(null);
  const [walkInBullets, setWalkInBullets] = useState<string[]>([]);

  useEffect(() => {
    initOfflineQueueUser(currentUserId);
    const prev = sessionStorage.getItem("saintly_offline_queue_user_mismatch");
    if (prev && prev !== currentUserId) {
      setUserMismatch(prev);
    }
  }, [currentUserId]);

  const loadRoute = useCallback(async () => {
    setLoadingRoute(true);
    try {
      const res = await fetch("/api/facilities/routes/active-today");
      const data = (await res.json()) as { ok?: boolean; route?: RoutePlanDetail | null };
      if (data.ok) setActiveRoute(data.route ?? null);
    } catch {
      // keep cached route if any
    } finally {
      setLoadingRoute(false);
    }
  }, []);

  useEffect(() => {
    void loadRoute();
  }, [loadRoute]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60_000 }
    );
  }, []);

  const nextStop = useMemo(() => {
    if (!activeRoute) return null;
    return activeRoute.stops.find((s) => {
      const eff = effectiveStopStatus(s, items);
      return eff.status === "pending" || eff.status === "checked_in" || eff.status === "pending_sync";
    }) ?? null;
  }, [activeRoute, items]);

  useEffect(() => {
    if (!nextStop?.facility_id) {
      setWalkInBullets([]);
      return;
    }
    void fetch(`/api/facilities/${nextStop.facility_id}/referral-profile`)
      .then((r) => r.json())
      .then((json: { ok?: boolean; summary?: { walk_in_bullets?: string[] } }) => {
        if (json.ok && json.summary?.walk_in_bullets) setWalkInBullets(json.summary.walk_in_bullets);
        else setWalkInBullets([]);
      })
      .catch(() => setWalkInBullets([]));
  }, [nextStop?.facility_id, nextStop?.id]);

  const progress = useMemo(() => {
    if (!activeRoute) return { done: 0, total: 0 };
    const done = activeRoute.stops.filter((s) => {
      const eff = effectiveStopStatus(s, items);
      return s.status === "completed" || s.status === "skipped" || eff.pendingComplete || eff.pendingSkip;
    }).length;
    return { done, total: activeRoute.stops.length };
  }, [activeRoute, items]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncOfflineQueue(currentUserId);
      refresh();
      await loadRoute();
      if (result.lastError) {
        setToast(`Some items failed to sync: ${result.lastError}`);
      } else if (result.processed > 0) {
        setToast(`Synced ${result.processed} item${result.processed === 1 ? "" : "s"}.`);
      }
    } catch {
      setToast("Sync failed. Try again.");
    } finally {
      setSyncing(false);
      clearWasOffline();
    }
  }, [currentUserId, refresh, loadRoute, clearWasOffline]);

  useEffect(() => {
    if (isOnline && wasOffline && pendingCount > 0 && !syncing) {
      // auto-sync when safe (small queue)
      if (pendingCount <= 5) void handleSync();
    }
  }, [isOnline, wasOffline, pendingCount, syncing, handleSync]);

  async function queueCheckIn(stop: RouteStopCard) {
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // ok without location
    }

    if (!isOnline) {
      await enqueueOfflineItem({
        type: "route_check_in",
        user_id: currentUserId,
        payload: { latitude: lat, longitude: lng, checked_in_at: new Date().toISOString() },
        related_facility_id: stop.facility_id,
        related_route_id: activeRoute?.id ?? null,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Checked in — pending sync");
      refresh();
      return;
    }

    const res = await fetch(`/api/facilities/routes/${activeRoute!.id}/stops/${stop.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
    if (!res.ok) {
      await enqueueOfflineItem({
        type: "route_check_in",
        user_id: currentUserId,
        payload: { latitude: lat, longitude: lng, checked_in_at: new Date().toISOString() },
        related_facility_id: stop.facility_id,
        related_route_id: activeRoute?.id ?? null,
        related_stop_id: stop.id,
        facility_name: stop.name,
      });
      setToast("Check-in saved to pending sync.");
      refresh();
      return;
    }
    setToast("Checked in.");
    await loadRoute();
  }

  async function queueCompleteStop(stop: RouteStopCard, activityId?: string | null, quickLogLocalId?: string | null) {
    const payload = { linked_activity_id: activityId ?? stop.linked_activity_id ?? null };

    if (!isOnline) {
      await enqueueOfflineItem({
        type: "route_stop_complete",
        user_id: currentUserId,
        payload,
        related_facility_id: stop.facility_id,
        related_route_id: activeRoute?.id ?? null,
        related_stop_id: stop.id,
        depends_on_local_id: quickLogLocalId ?? null,
        facility_name: stop.name,
      });
      setToast("Stop completion queued for sync.");
      refresh();
      return;
    }

    const res = await fetch(`/api/facilities/routes/${activeRoute!.id}/stops/${stop.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await enqueueOfflineItem({
        type: "route_stop_complete",
        user_id: currentUserId,
        payload,
        related_facility_id: stop.facility_id,
        related_route_id: activeRoute?.id ?? null,
        related_stop_id: stop.id,
        depends_on_local_id: quickLogLocalId ?? null,
        facility_name: stop.name,
      });
      setToast("Stop completion saved to pending sync.");
      refresh();
      return;
    }
    setCompletePromptStop(null);
    setSelectedStop(null);
    await loadRoute();
  }

  function openPicker(mode: "quick_log" | "photo_note" | "ai_capture", stop?: RouteStopCard | null) {
    if (stop?.facility_id) {
      setPickedFacility({
        id: stop.facility_id,
        name: stop.name,
        address: stop.address ?? "",
        type: null,
        city: null,
        phone: stop.phone ?? null,
        lastVisitAt: null,
      });
      setSelectedStop(stop);
      if (mode === "quick_log") setQuickLogOpen(true);
      else if (mode === "photo_note") setPhotoOpen(true);
      else setAiCaptureOpen(true);
      return;
    }
    setPickerMode(mode);
    setPickerOpen(true);
  }

  function handlePickerSelect(f: FacilityPickerItem) {
    setPickedFacility(f);
    setPickerOpen(false);
    if (pickerMode === "quick_log") setQuickLogOpen(true);
    else if (pickerMode === "photo_note") setPhotoOpen(true);
    else if (pickerMode === "ai_capture") setAiCaptureOpen(true);
    setPickerMode(null);
  }

  async function handleRetry(localId: string) {
    setRetryingId(localId);
    try {
      await retryOfflineQueueItem(localId);
      refresh();
      await loadRoute();
      setToast("Item synced.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  }

  function handleEditPending(item: OfflineQueueItem) {
    if (item.type === "ai_capture_note") {
      setAiCaptureDefaultText(String(item.payload.raw_text ?? ""));
      if (item.related_facility_id) {
        setPickedFacility({
          id: item.related_facility_id,
          name: item.facility_name ?? "Facility",
          address: "",
          type: null,
          city: null,
          phone: null,
          lastVisitAt: null,
        });
      }
      setAiCaptureOpen(true);
      return;
    }
    if (item.type === "quick_log" && item.related_facility_id) {
      setPickedFacility({
        id: item.related_facility_id,
        name: item.facility_name ?? "Facility",
        address: "",
        type: null,
        city: null,
        phone: null,
        lastVisitAt: null,
      });
      setQuickLogOpen(true);
    }
  }

  const stopForCard = nextStop;
  const stopEff = stopForCard ? effectiveStopStatus(stopForCard, items) : null;
  const mapsUrl = stopForCard
    ? appleMapsDirectionsUrl({
        address: stopForCard.address ?? undefined,
        latitude: stopForCard.latitude,
        longitude: stopForCard.longitude,
      })
    : null;
  const tel = stopForCard?.phone?.trim() ? `tel:${stopForCard.phone.replace(/[^\d+]/g, "")}` : null;
  const distance =
    stopForCard && userLocation && stopForCard.latitude != null && stopForCard.longitude != null
      ? formatDistanceMiles(
          haversineDistanceMiles(userLocation, { latitude: stopForCard.latitude, longitude: stopForCard.longitude })
        )
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-28">
      {userMismatch ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Pending drafts were saved under a different account. Sign in as the original user to sync them.
        </div>
      ) : null}

      <FacilityOfflineStatusBar
        pendingCount={pendingCount}
        lastSyncAt={lastSyncAt}
        syncing={syncing}
        onSyncNow={() => void handleSync()}
        showBackOnlinePrompt={wasOffline}
        onDismissBackOnline={clearWasOffline}
      />

      <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Tip: Add this page to your phone home screen for faster field access.
      </p>

      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{toast}</div>
      ) : null}

      {/* Today's Active Route */}
      <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-teal-800">Today&apos;s Route</h2>
        {loadingRoute ? (
          <p className="mt-2 text-sm text-slate-600">Loading…</p>
        ) : activeRoute ? (
          <>
            <p className="mt-2 text-lg font-bold text-slate-900">{activeRoute.name}</p>
            <p className="text-sm text-slate-600">
              Progress: {progress.done} of {progress.total} stops completed
              {pendingForRoute(activeRoute.id) > 0 ? ` · ${pendingForRoute(activeRoute.id)} pending sync` : ""}
            </p>
            <Link href={`/admin/facilities/routes/${activeRoute.id}`} className={`${btnPrimary} mt-3`}>
              Continue Route
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">No active route for today.</p>
            <div className="mt-3 space-y-2">
              <Link href="/admin/facilities/outreach" className={btnPrimary}>
                Open Today&apos;s Outreach
              </Link>
              <Link href="/admin/facilities/route-builder" className={btnSecondary}>
                Build Route
              </Link>
              <Link href="/admin/facilities/finder" className={btnSecondary}>
                Find Near Me
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Next Stop Card */}
      {stopForCard ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {stopForCard.facility_id && walkInBullets.length ? (
            <div className="mb-4">
              <FacilityBeforeWalkInCard
                facilityId={stopForCard.facility_id}
                facilityName={stopForCard.name}
                bullets={walkInBullets}
                compact
              />
            </div>
          ) : null}
          <p className="text-xs font-bold uppercase text-slate-400">Next Stop · #{stopForCard.stop_order}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{stopForCard.name}</h3>
          {stopForCard.address ? <p className="mt-1 text-sm text-slate-600">{stopForCard.address}</p> : null}
          {stopForCard.phone ? <p className="text-sm text-slate-600">{formatPhoneForDisplay(stopForCard.phone)}</p> : null}
          <p className="mt-1 text-xs text-slate-500">
            {ROUTE_STOP_STATUS_LABELS[stopEff?.status === "pending_sync" ? stopForCard.status : stopEff!.status]}
            {stopEff?.pendingCheckIn ? " — pending sync" : ""}
            {distance ? ` · ${distance} away` : ""}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
                Directions
              </a>
            ) : null}
            {tel ? (
              <a href={tel} className={btnSecondary}>
                Call
              </a>
            ) : null}
            {stopForCard.status !== "completed" && stopForCard.status !== "skipped" && !stopEff?.pendingComplete ? (
              <button type="button" className={btnSecondary} onClick={() => void queueCheckIn(stopForCard)}>
                Check In
              </button>
            ) : null}
            {stopForCard.facility_id ? (
              <>
                <button type="button" className={btnSecondary} onClick={() => openPicker("quick_log", stopForCard)}>
                  Quick Log
                </button>
                <button type="button" className={btnSecondary} onClick={() => openPicker("ai_capture", stopForCard)}>
                  AI Capture
                </button>
                <button type="button" className={btnSecondary} onClick={() => openPicker("photo_note", stopForCard)}>
                  Photo Note
                </button>
                <ShowReferralQrButton
                  facilityId={stopForCard.facility_id}
                  facilityName={stopForCard.name}
                  className={btnSecondary}
                  showCopy={false}
                />
              </>
            ) : (
              <ShowReferralQrButton className={btnSecondary} fallbackToUniversal showCopy={false} />
            )}
            {stopForCard.status !== "completed" && stopForCard.status !== "skipped" ? (
              <>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => {
                    if (!stopForCard.linked_activity_id && stopForCard.facility_id) {
                      setCompletePromptStop(stopForCard);
                    } else {
                      void queueCompleteStop(stopForCard);
                    }
                  }}
                >
                  Complete Stop
                </button>
                <button type="button" className={`${btnSecondary} text-rose-800`} onClick={() => setSkipStop(stopForCard)}>
                  Skip
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : activeRoute ? (
        <p className="text-center text-sm text-slate-600">All stops done for today&apos;s route.</p>
      ) : null}

      {/* Pending Sync */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pending Sync</h2>
        <div className="mt-3">
          <FacilityPendingSyncPanel
            items={items}
            onRetry={(id) => void handleRetry(id)}
            onEdit={handleEditPending}
            retryingId={retryingId}
          />
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick Actions</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={btnSecondary} onClick={() => openPicker("quick_log")}>
            Quick Log
          </button>
          <button type="button" className={btnSecondary} onClick={() => openPicker("photo_note")}>
            Photo Note
          </button>
          <button type="button" className={btnSecondary} onClick={() => openPicker("ai_capture")}>
            AI Capture
          </button>
          <Link href="/admin/facilities/finder" className={btnSecondary}>
            Find Near Me
          </Link>
          <Link href="/admin/facilities/discover" className={btnSecondary}>
            Discover
          </Link>
          <Link href="/admin/facilities/routes" className={btnSecondary}>
            Saved Routes
          </Link>
        </div>
      </section>

      <FacilityPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickerSelect} />

      {pickedFacility && quickLogOpen ? (
        <FacilityQuickLogModal
          facilityId={pickedFacility.id}
          facilityName={pickedFacility.name}
          open
          userId={currentUserId}
          relatedRouteId={activeRoute?.id ?? selectedStop ? activeRoute?.id : null}
          relatedStopId={selectedStop?.id ?? null}
          onClose={() => {
            setQuickLogOpen(false);
            setPickedFacility(null);
            setSelectedStop(null);
          }}
          onSaved={() => {
            refresh();
            void loadRoute();
          }}
          onSavedMessage={(msg) => setToast(msg)}
          onActivitySaved={(activityId) => {
            if (selectedStop) void queueCompleteStop(selectedStop, activityId);
          }}
          onOfflineQueued={() => refresh()}
        />
      ) : null}

      {pickedFacility && photoOpen ? (
        <FacilityPhotoUploadModal
          open
          facilityId={pickedFacility.id}
          facilityName={pickedFacility.name}
          userId={currentUserId}
          relatedRouteId={activeRoute?.id ?? null}
          relatedStopId={selectedStop?.id ?? null}
          sourceContext="facility_detail"
          onClose={() => {
            setPhotoOpen(false);
            setPickedFacility(null);
            setSelectedStop(null);
          }}
          onSaved={() => {
            refresh();
            void loadRoute();
          }}
          onOfflineQueued={() => {
            setToast("Photo note saved to pending sync.");
            refresh();
          }}
        />
      ) : null}

      {aiCaptureOpen ? (
        <FacilityAiCaptureModal
          open
          facilityId={pickedFacility?.id}
          facilityName={pickedFacility?.name}
          defaultText={aiCaptureDefaultText}
          userId={currentUserId}
          relatedRouteId={activeRoute?.id ?? null}
          relatedStopId={selectedStop?.id ?? null}
          sourceContext="facility_detail"
          onClose={() => {
            setAiCaptureOpen(false);
            setPickedFacility(null);
            setSelectedStop(null);
            setAiCaptureDefaultText("");
          }}
          onSaved={() => {
            refresh();
            void loadRoute();
          }}
          onSavedMessage={(msg) => setToast(msg)}
          onOfflineQueued={() => refresh()}
        />
      ) : null}

      {completePromptStop?.facility_id ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <p className="text-base font-semibold text-slate-900">Quick Log this visit before completing?</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={crmActionBtnSky} onClick={() => openPicker("quick_log", completePromptStop)}>
                Quick Log
              </button>
              <button type="button" className={crmActionBtnMuted} onClick={() => void queueCompleteStop(completePromptStop)}>
                Complete Without Log
              </button>
              <button type="button" className={crmActionBtnMuted} onClick={() => setCompletePromptStop(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {skipStop ? (
        <FacilitySkipStopModal
          open
          onClose={() => setSkipStop(null)}
          onConfirm={async ({ skip_reason, notes }) => {
            if (!isOnline) {
              await enqueueOfflineItem({
                type: "route_stop_skip",
                user_id: currentUserId,
                payload: { skip_reason, notes },
                related_facility_id: skipStop.facility_id,
                related_route_id: activeRoute?.id ?? null,
                related_stop_id: skipStop.id,
                facility_name: skipStop.name,
              });
              setToast("Skip queued for sync.");
              refresh();
            } else {
              const res = await fetch(`/api/facilities/routes/${activeRoute!.id}/stops/${skipStop.id}/skip`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skip_reason, notes }),
              });
              if (!res.ok) {
                await enqueueOfflineItem({
                  type: "route_stop_skip",
                  user_id: currentUserId,
                  payload: { skip_reason, notes },
                  related_facility_id: skipStop.facility_id,
                  related_route_id: activeRoute?.id ?? null,
                  related_stop_id: skipStop.id,
                  facility_name: skipStop.name,
                });
                setToast("Skip saved to pending sync.");
                refresh();
              } else {
                await loadRoute();
              }
            }
            setSkipStop(null);
          }}
        />
      ) : null}
    </div>
  );
}
