"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AnalyticsNavLink } from "@/app/admin/facilities/_components/AnalyticsNavLink";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { FacilityAiCaptureModal } from "@/app/admin/facilities/_components/FacilityAiCaptureModal";
import { FacilityAlertBanner } from "@/app/admin/facilities/_components/FacilityAlertBanner";
import { FacilityDailySummaryCard } from "@/app/admin/facilities/_components/FacilityDailySummaryCard";
import { FacilityAiCaptureButton } from "@/app/admin/facilities/_components/FacilityAiCaptureButton";
import {
  FacilityPickerModal,
  type FacilityPickerItem,
} from "@/app/admin/facilities/_components/FacilityPickerModal";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityPhotoUploadModal } from "@/app/admin/facilities/_components/FacilityPhotoWorkflow";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";
import { FacilitySaveRoutePlanModal } from "@/app/admin/facilities/_components/FacilitySaveRoutePlanModal";
import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { useFacilityOfflineQueue } from "@/app/admin/facilities/_components/useFacilityOfflineQueue";
import { useFacilityNotifications } from "@/app/admin/facilities/_components/useFacilityNotifications";
import { OutreachFacilityBoard } from "@/app/admin/facilities/_components/outreach/OutreachFacilityBoard";
import { OutreachLazySection, OutreachSectionSkeleton } from "@/app/admin/facilities/_components/outreach/OutreachLazySection";
import { OutreachPacketRequestsSection } from "@/app/admin/facilities/_components/outreach/OutreachPacketRequestsSection";
import { useOutreachSummary, type GeoCoords } from "@/app/admin/facilities/_components/outreach/useOutreachSection";
import type { FollowUpTaskSummary } from "@/lib/crm/facility-follow-up-task-types";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { initOfflineQueueUser } from "@/lib/crm/facility-offline-queue";
import {
  addFacilityToRouteDraft,
  FACILITY_ROUTE_DRAFT_EVENT,
  getFacilityRouteDraft,
  notifyRouteDraftChanged,
  removeStopFromRouteDraft,
  type FacilityRouteDraftStop,
} from "@/lib/crm/facility-route-draft";
import { formatRouteListForCopy } from "@/lib/crm/facility-route-builder";
import type { RoutePlanDetail } from "@/lib/crm/facility-route-types";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

const FacilityOutreachFollowUpTasks = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityOutreachFollowUpTasks").then(
      (m) => m.FacilityOutreachFollowUpTasks
    ),
  { loading: () => <OutreachSectionSkeleton rows={2} /> }
);

const FacilityCampaignStepsSection = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityCampaignStepsSection").then(
      (m) => m.FacilityCampaignStepsSection
    ),
  { loading: () => null }
);

const OutreachRecentActivitySection = dynamic(
  () =>
    import("@/app/admin/facilities/_components/outreach/OutreachRecentActivitySection").then(
      (m) => m.OutreachRecentActivitySection
    ),
  { loading: () => <OutreachSectionSkeleton rows={2} /> }
);

const btnField =
  "inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.98]";
const btnPrimary = `${btnField} border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white`;
const btnSecondary = `${btnField} border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60`;
const btnTeal = `${btnField} border-teal-600 bg-teal-50 text-teal-900 hover:bg-teal-100`;
const sectionTitle = "text-sm font-bold uppercase tracking-wide text-slate-500";

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; latitude: number; longitude: number }
  | { status: "denied" | "unavailable" | "error"; message: string };

function stopBadge(stop: FacilityRouteDraftStop): { label: string; cls: string } {
  if (stop.facilityId) return { label: "In Portal", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" };
  if (stop.googlePlaceId) return { label: "Google Place", cls: "bg-violet-50 text-violet-900 ring-violet-200" };
  return { label: "Not Added Yet", cls: "bg-amber-50 text-amber-900 ring-amber-200" };
}

export function FacilityOutreachView({
  showManagerAnalyticsLink = false,
  currentUserId,
}: {
  showManagerAnalyticsLink?: boolean;
  currentUserId?: string;
}) {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [routeStops, setRouteStops] = useState<FacilityRouteDraftStop[]>([]);
  const [routeIds, setRouteIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [taskSummary, setTaskSummary] = useState<FollowUpTaskSummary | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"quick_log" | "photo_note" | null>(null);
  const [globalQuickLogOpen, setGlobalQuickLogOpen] = useState(false);
  const [globalAiCaptureOpen, setGlobalAiCaptureOpen] = useState(false);
  const [globalPhotoOpen, setGlobalPhotoOpen] = useState(false);
  const [pickedFacility, setPickedFacility] = useState<FacilityPickerItem | null>(null);
  const [activeRoute, setActiveRoute] = useState<RoutePlanDetail | null>(null);
  const [showSaveRoutePlan, setShowSaveRoutePlan] = useState(false);

  const geo: GeoCoords = useMemo(
    () => (location.status === "ready" ? { latitude: location.latitude, longitude: location.longitude } : null),
    [location]
  );

  const { summary, loading: summaryLoading, error: summaryError, refresh: refreshSummary } = useOutreachSummary(geo);
  const { pendingCount } = useFacilityOfflineQueue(currentUserId);

  useEffect(() => {
    if (currentUserId) initOfflineQueueUser(currentUserId);
  }, [currentUserId]);

  const { daily, notifications, loading: alertsLoading } = useFacilityNotifications();

  useEffect(() => {
    void fetch("/api/facilities/routes/active-today")
      .then((r) => r.json())
      .then((json: { ok?: boolean; route?: RoutePlanDetail | null }) => {
        if (json.ok) setActiveRoute(json.route ?? null);
      })
      .catch(() => undefined);
  }, []);

  const refreshRoute = useCallback(() => {
    try {
      const draft = getFacilityRouteDraft();
      setRouteStops(draft.stops);
      setRouteIds(new Set(draft.stops.map((s) => s.facilityId).filter(Boolean) as string[]));
    } catch {
      setRouteStops([]);
      setRouteIds(new Set());
    }
  }, []);

  useEffect(() => {
    refreshRoute();
    const onDraft = () => refreshRoute();
    window.addEventListener(FACILITY_ROUTE_DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(FACILITY_ROUTE_DRAFT_EVENT, onDraft);
  }, [refreshRoute]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({ status: "unavailable", message: "Location is not available in this browser." });
      return;
    }
    setLocation({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ status: "ready", latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        setLocation({
          status: "denied",
          message: "Location is not enabled. You can still search or use Discover New Facilities.",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  const routeStats = useMemo(() => {
    const visited = routeStops.filter((s) => s.visitState === "visited").length;
    const skipped = routeStops.filter((s) => s.visitState === "skipped").length;
    const pending = routeStops.filter((s) => s.visitState !== "visited" && s.visitState !== "skipped");
    return { visited, skipped, pending, next: pending[0] ?? null };
  }, [routeStops]);

  const upcomingStops = useMemo(
    () => routeStops.filter((s) => s.visitState !== "visited" && s.visitState !== "skipped").slice(0, 3),
    [routeStops]
  );

  const openNextStopMaps = useCallback(() => {
    const stop = routeStats.next;
    if (!stop) return;
    const url = appleMapsDirectionsUrl({
      address: stop.address ?? stop.address_line_1,
      latitude: stop.latitude,
      longitude: stop.longitude,
    });
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [routeStats.next]);

  const copyRouteList = useCallback(() => {
    try {
      void navigator.clipboard.writeText(formatRouteListForCopy(routeStops));
      showToast("Route copied.");
    } catch {
      showToast("Could not copy route.");
    }
  }, [routeStops, showToast]);

  const openPicker = useCallback((mode: "quick_log" | "photo_note") => {
    setPickerMode(mode);
    setPickerOpen(true);
  }, []);

  const handlePicked = useCallback((f: FacilityPickerItem) => {
    setPickedFacility(f);
    if (pickerMode === "quick_log") setGlobalQuickLogOpen(true);
    if (pickerMode === "photo_note") setGlobalPhotoOpen(true);
    setPickerMode(null);
  }, [pickerMode]);

  const handleTaskSummary = useCallback((s: FollowUpTaskSummary) => {
    setTaskSummary(s);
  }, []);

  const routeUnfinishedCount = routeStats.pending.length;
  const isLateDay = new Date().getHours() >= 16;

  const bannerItems = useMemo(
    () => [
      ...(routeUnfinishedCount > 0 && isLateDay
        ? [
            {
              key: "route_unfinished",
              title: `You still have ${routeUnfinishedCount} route stop${routeUnfinishedCount === 1 ? "" : "s"} not marked visited or skipped.`,
              severity: "warning" as const,
              actionUrl: "/admin/facilities/route-builder",
              actionLabel: "Open Route Builder",
            },
          ]
        : []),
      ...notifications.slice(0, 4).map((n) => ({
        key: n.id,
        title: n.title,
        message: n.message ?? undefined,
        severity: n.severity,
        actionUrl: n.action_url ?? undefined,
        actionLabel: "Open",
      })),
    ],
    [routeUnfinishedCount, isLateDay, notifications]
  );

  const summaryStats = useMemo(
    () => [
      {
        label: "Task follow-ups",
        value: taskSummary
          ? taskSummary.overdue + taskSummary.due_today
          : (summary?.overdue ?? 0) + (summary?.due_today ?? 0),
      },
      { label: "Route stops", value: routeStops.length },
      { label: "Not visited", value: summary?.not_visited ?? 0 },
      { label: "Logged this week", value: summary?.logged_this_week ?? 0 },
    ],
    [taskSummary, summary, routeStops.length]
  );

  return (
    <div className="space-y-5 pb-36">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href="/admin/facilities/finder" className={btnTeal}>
            Find Near Me
          </Link>
          <Link href="/admin/facilities/discover" className={btnSecondary}>
            Discover
          </Link>
          <Link href="/admin/facilities/route-builder" className={btnSecondary}>
            Route Builder
          </Link>
          <button type="button" className={btnSecondary} onClick={() => setGlobalAiCaptureOpen(true)}>
            AI Capture
          </button>
          <button type="button" className={btnSecondary} onClick={() => openPicker("quick_log")}>
            Quick Log
          </button>
          <button type="button" className={btnSecondary} onClick={() => openPicker("photo_note")}>
            Photo Note
          </button>
        </div>
      </div>

      <FacilityDailySummaryCard
        summary={daily}
        routeUnfinishedCount={isLateDay ? routeUnfinishedCount : 0}
        loading={alertsLoading}
      />

      <FacilityAlertBanner items={bannerItems} title="Needs attention today" />

      <OutreachLazySection minHeight="0">
        <FacilityCampaignStepsSection />
      </OutreachLazySection>

      {showManagerAnalyticsLink ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Manager view</p>
              <p className="mt-1 text-sm text-indigo-950">
                See agent performance, warm sources, follow-up discipline, and photo proof.
              </p>
            </div>
            <AnalyticsNavLink className="inline-flex shrink-0 items-center justify-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700" />
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summaryStats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{summaryLoading ? "—" : s.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Field Mode</p>
            <p className="mt-1 text-sm text-emerald-950">Continue today&apos;s route and sync pending field notes.</p>
            <p className="mt-2 text-xs text-emerald-900">
              {activeRoute
                ? `Active route: ${activeRoute.name} · ${activeRoute.completed_count + activeRoute.skipped_count}/${activeRoute.stop_count} done`
                : "No active route for today"}
              {pendingCount > 0 ? ` · ${pendingCount} pending sync` : ""}
            </p>
          </div>
          <FieldModeNavLink className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-emerald-700 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Link href="/admin/facilities/finder" className={`${btnPrimary} col-span-2 sm:col-span-1`}>
          Find Near Me
        </Link>
        <Link href="/admin/facilities/discover" className={btnSecondary}>
          Discover New
        </Link>
        <Link href="/admin/facilities/route-builder" className={btnSecondary}>
          Route Builder
        </Link>
        <RoutesNavLink className={`${btnSecondary} text-center`} />
        <ReferralsNavLink className={`${btnSecondary} text-center`} />
        <button type="button" className={btnSecondary} onClick={() => setGlobalAiCaptureOpen(true)}>
          AI Capture
        </button>
        <button type="button" className={btnSecondary} onClick={() => openPicker("quick_log")}>
          Quick Log
        </button>
        <button type="button" className={btnSecondary} onClick={() => openPicker("photo_note")}>
          Photo Note
        </button>
      </section>

      {summaryError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{summaryError}</div>
      ) : null}

      <OutreachLazySection>
        <section className="space-y-3">
          <h2 className={sectionTitle}>Active Route Plan</h2>
          {activeRoute ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
              <p className="font-semibold text-slate-900">{activeRoute.name}</p>
              <p className="text-sm text-slate-600">
                {activeRoute.completed_count + activeRoute.skipped_count}/{activeRoute.stop_count} stops done ·{" "}
                {activeRoute.pending_count} pending
              </p>
              {activeRoute.stops.find((s) => s.status === "pending" || s.status === "checked_in") ? (
                <p className="mt-1 text-sm text-teal-900">
                  Next: {activeRoute.stops.find((s) => s.status === "pending" || s.status === "checked_in")?.name}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/admin/facilities/routes/${activeRoute.id}`} className={btnPrimary}>
                  Continue Route
                </Link>
                {(() => {
                  const next = activeRoute.stops.find((s) => s.status === "pending" || s.status === "checked_in");
                  const mapsUrl = next
                    ? appleMapsDirectionsUrl({
                        address: next.address ?? undefined,
                        latitude: next.latitude,
                        longitude: next.longitude,
                      })
                    : null;
                  return mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                      Open Next Stop in Maps
                    </a>
                  ) : null;
                })()}
              </div>
            </div>
          ) : routeStops.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm text-amber-950">You have an unsaved route draft ({routeStops.length} stops).</p>
              <button type="button" className={`${btnSecondary} mt-2`} onClick={() => setShowSaveRoutePlan(true)}>
                Save Route Plan
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No saved route for today. Build one in Route Builder.</p>
          )}
        </section>
      </OutreachLazySection>

      <section className="space-y-3">
        <h2 className={sectionTitle}>Today&apos;s Route</h2>
        {routeStops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
            <p className="font-semibold text-slate-800">No route planned yet.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href="/admin/facilities/route-builder" className={btnPrimary}>
                Build Route
              </Link>
              <Link href="/admin/facilities/finder" className={btnSecondary}>
                Find Facilities Near Me
              </Link>
              <Link href="/admin/facilities/discover" className={btnSecondary}>
                Discover New Facilities
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Stops</span>
                  <p className="font-bold text-slate-900">{routeStops.length}</p>
                </div>
                <div>
                  <span className="text-slate-500">Visited</span>
                  <p className="font-bold text-emerald-800">{routeStats.visited}</p>
                </div>
                <div>
                  <span className="text-slate-500">Skipped</span>
                  <p className="font-bold text-amber-800">{routeStats.skipped}</p>
                </div>
                <div>
                  <span className="text-slate-500">Next stop</span>
                  <p className="truncate font-bold text-slate-900">{routeStats.next?.name ?? "—"}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Link href="/admin/facilities/route-builder" className={btnPrimary}>
                  Open Route Builder
                </Link>
                <button
                  type="button"
                  disabled={!routeStats.next}
                  onClick={openNextStopMaps}
                  className={`${btnSecondary} disabled:opacity-50`}
                >
                  Open Next Stop in Maps
                </button>
                <button type="button" onClick={copyRouteList} className={btnSecondary}>
                  Copy Route List
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {upcomingStops.map((stop, idx) => {
                const badge = stopBadge(stop);
                const mapsUrl = appleMapsDirectionsUrl({
                  address: stop.address ?? stop.address_line_1,
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                });
                const inPortal = Boolean(stop.facilityId);
                return (
                  <article key={stop.localId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-indigo-700">Stop {idx + 1}</span>
                        <h3 className="text-base font-semibold text-slate-900">{stop.name}</h3>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{stop.address ?? stop.address_line_1 ?? "—"}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noreferrer" className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}>
                          Directions
                        </a>
                      ) : null}
                      {inPortal && stop.facilityId ? (
                        <>
                          <FacilityQuickLogButton
                            facilityId={stop.facilityId}
                            facilityName={stop.name}
                            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center`}
                          />
                          <FacilityAiCaptureButton
                            facilityId={stop.facilityId}
                            facilityName={stop.name}
                            sourceContext="route_builder"
                            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
                          />
                          <FacilityPhotoNoteButton
                            facilityId={stop.facilityId}
                            facilityName={stop.name}
                            sourceContext="route_builder"
                            className={`${crmActionBtnMuted} min-h-[2.5rem] text-center text-[11px]`}
                          />
                        </>
                      ) : (
                        <Link href="/admin/facilities/route-builder" className={`${crmActionBtnSky} min-h-[2.5rem] text-center`}>
                          Quick Add
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <OutreachLazySection>
        <FacilityOutreachFollowUpTasks onSummary={handleTaskSummary} onToast={showToast} />
      </OutreachLazySection>

      <OutreachLazySection>
        <OutreachPacketRequestsSection onUpdated={() => void refreshSummary()} />
      </OutreachLazySection>

      <OutreachFacilityBoard
        sectionCounts={summary?.section_counts ?? {}}
        routeIds={routeIds}
        onRouteChange={refreshRoute}
        geo={geo}
        onRequestLocation={requestLocation}
        locationStatus={location.status}
        locationMessage={location.status !== "idle" && location.status !== "ready" && location.status !== "requesting" ? location.message : undefined}
      />

      <OutreachLazySection>
        <OutreachRecentActivitySection />
      </OutreachLazySection>

      <FacilityPickerModal
        open={pickerOpen}
        title={pickerMode === "photo_note" ? "Photo Note — choose facility" : "Quick Log — choose facility"}
        onClose={() => {
          setPickerOpen(false);
          setPickerMode(null);
        }}
        onSelect={handlePicked}
      />

      {pickedFacility ? (
        <FacilityQuickLogModal
          facilityId={pickedFacility.id}
          facilityName={pickedFacility.name}
          open={globalQuickLogOpen}
          onClose={() => {
            setGlobalQuickLogOpen(false);
            setPickedFacility(null);
          }}
          onSaved={() => {
            setGlobalQuickLogOpen(false);
            setPickedFacility(null);
            void refreshSummary();
          }}
        />
      ) : null}

      <FacilityAiCaptureModal
        open={globalAiCaptureOpen}
        sourceContext="facilities_list"
        currentLatitude={location.status === "ready" ? location.latitude : undefined}
        currentLongitude={location.status === "ready" ? location.longitude : undefined}
        onClose={() => setGlobalAiCaptureOpen(false)}
        onSaved={() => {
          setGlobalAiCaptureOpen(false);
          void refreshSummary();
        }}
      />

      {pickedFacility && globalPhotoOpen ? (
        <FacilityPhotoUploadModal
          open={globalPhotoOpen}
          facilityId={pickedFacility.id}
          facilityName={pickedFacility.name}
          sourceContext="facility_detail"
          onClose={() => {
            setGlobalPhotoOpen(false);
            setPickedFacility(null);
          }}
          onSaved={() => {
            setGlobalPhotoOpen(false);
            setPickedFacility(null);
            void refreshSummary();
          }}
        />
      ) : null}

      {currentUserId ? (
        <FacilitySaveRoutePlanModal
          open={showSaveRoutePlan}
          onClose={() => setShowSaveRoutePlan(false)}
          currentUserId={currentUserId}
          canAssignOthers={showManagerAnalyticsLink}
          onSaved={() => {
            setShowSaveRoutePlan(false);
            void fetch("/api/facilities/routes/active-today")
              .then((r) => r.json())
              .then((json: { ok?: boolean; route?: RoutePlanDetail | null }) => {
                if (json.ok) setActiveRoute(json.route ?? null);
              });
          }}
        />
      ) : null}
    </div>
  );
}
