"use client";

import { useCallback, useEffect, useState } from "react";

import type { OutreachSectionId } from "@/lib/crm/facility-outreach-types";
import { trackOutreachCardsRendered } from "@/lib/perf/outreach-dev-perf";

import { OutreachFacilityCardView } from "./OutreachFacilityCard";
import { OutreachSectionSkeleton } from "./OutreachLazySection";
import { type GeoCoords, useOutreachFacilitySection } from "./useOutreachSection";

const sectionTitle = "text-sm font-bold uppercase tracking-wide text-slate-500";

type FacilityTab = {
  id: OutreachSectionId;
  label: string;
  showDue?: boolean;
  showWhy?: boolean;
  needsLocation?: boolean;
};

const TABS: FacilityTab[] = [
  { id: "follow_ups_due", label: "Follow-ups due", showDue: true },
  { id: "not_visited", label: "Not visited" },
  { id: "near_me", label: "Near me", needsLocation: true },
  { id: "high_priority", label: "High priority", showDue: true, showWhy: true },
];

type OutreachFacilityBoardProps = {
  sectionCounts: Partial<Record<OutreachSectionId, number>>;
  routeIds: Set<string>;
  onRouteChange: () => void;
  geo: GeoCoords;
  onRequestLocation: () => void;
  locationStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";
  locationMessage?: string;
};

function TabPanel({
  tab,
  routeIds,
  onRouteChange,
  geo,
}: {
  tab: FacilityTab;
  routeIds: Set<string>;
  onRouteChange: () => void;
  geo: GeoCoords;
}) {
  const { items, total, hasMore, loading, loadingMore, error, loadMore } = useOutreachFacilitySection(
    tab.id,
    geo
  );

  useEffect(() => {
    if (items.length > 0) {
      trackOutreachCardsRendered(items.length);
    }
  }, [items.length]);

  if (loading) {
    return <OutreachSectionSkeleton rows={3} />;
  }

  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  }

  if (items.length === 0) {
    const emptyMessages: Record<string, string> = {
      follow_ups_due: "No follow-ups due today. Nice work.",
      not_visited: "All active facilities have at least one visit logged.",
      near_me: "No portal facilities found within 15 miles.",
      high_priority: "No high-priority facilities flagged right now.",
    };
    return (
      <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        {emptyMessages[tab.id] ?? "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-slate-500">
        Showing {items.length} of {total}
      </p>
      <div className="space-y-3">
        {items.map((f) => (
          <OutreachFacilityCardView
            key={f.id}
            facility={f}
            showDue={tab.showDue}
            showWhy={tab.showWhy}
            inRoute={routeIds.has(f.id)}
            onRouteChange={onRouteChange}
          />
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={loadMore}
          className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more facilities"}
        </button>
      ) : null}
    </>
  );
}

export function OutreachFacilityBoard({
  sectionCounts,
  routeIds,
  onRouteChange,
  geo,
  onRequestLocation,
  locationStatus,
  locationMessage,
}: OutreachFacilityBoardProps) {
  const [activeTab, setActiveTab] = useState<OutreachSectionId>("follow_ups_due");

  const handleTabClick = useCallback((tab: FacilityTab) => {
    setActiveTab(tab.id);
  }, []);

  const activeTabDef = TABS.find((t) => t.id === activeTab)!;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitle}>Facility board</h2>
        {activeTab === "near_me" ? (
          <button type="button" onClick={onRequestLocation} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800">
            {locationStatus === "requesting" ? "Locating…" : "Use My Location"}
          </button>
        ) : null}
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => {
          const count = sectionCounts[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                isActive
                  ? "bg-sky-700 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-sky-200"
              }`}
            >
              {tab.label}
              {typeof count === "number" ? (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? "bg-sky-600" : "bg-slate-100"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "near_me" && locationStatus !== "ready" && locationStatus !== "requesting" ? (
        <p className="text-sm text-slate-500">
          {locationMessage ?? "Enable location to see nearby portal facilities."}
        </p>
      ) : null}

      {activeTab === "near_me" && (locationStatus === "denied" || locationStatus === "error" || locationStatus === "unavailable") && locationMessage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {locationMessage}
        </p>
      ) : null}

      <TabPanel
        key={`${activeTab}-${geo ? `${geo.latitude},${geo.longitude}` : "none"}`}
        tab={activeTabDef}
        routeIds={routeIds}
        onRouteChange={onRouteChange}
        geo={geo}
      />
    </section>
  );
}
