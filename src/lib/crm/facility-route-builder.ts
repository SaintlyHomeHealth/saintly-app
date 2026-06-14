/**
 * Route list formatting and recommended stop ordering for Route Builder.
 */

import {
  formatDistanceMiles,
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";
import type { FacilityRouteDraftStop } from "@/lib/crm/facility-route-draft";

export type EnrichedRouteStop = FacilityRouteDraftStop & {
  distanceMiles: number | null;
  distanceLabel: string;
  stopNumber: number;
};

export function stopDistanceMiles(
  origin: GeoPoint | null,
  stop: FacilityRouteDraftStop
): number | null {
  if (!origin) return null;
  if (
    !isValidGeoPoint({ latitude: stop.latitude ?? NaN, longitude: stop.longitude ?? NaN })
  ) {
    return null;
  }
  return haversineDistanceMiles(origin, {
    latitude: stop.latitude!,
    longitude: stop.longitude!,
  });
}

export function sortStopsByDistance(
  stops: FacilityRouteDraftStop[],
  origin: GeoPoint | null
): FacilityRouteDraftStop[] {
  if (!origin) return [...stops];

  const withDist = stops.map((s, index) => ({
    stop: s,
    index,
    dist: stopDistanceMiles(origin, s),
  }));

  withDist.sort((a, b) => {
    if (a.dist == null && b.dist == null) return a.index - b.index;
    if (a.dist == null) return 1;
    if (b.dist == null) return -1;
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.index - b.index;
  });

  return withDist.map((w) => w.stop);
}

function followUpScore(nextFollowUpAt: string | null | undefined): number {
  if (!nextFollowUpAt) return 0;
  const due = new Date(nextFollowUpAt);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  if (due <= now) return 30;
  const days = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 3) return 15;
  return 0;
}

function priorityScore(priority: string | null | undefined): number {
  if (priority === "High") return 20;
  if (priority === "Medium") return 5;
  return 0;
}

/**
 * Recommended order: distance-first with boosts for due follow-up and high priority portal stops.
 */
export function sortStopsRecommended(
  stops: FacilityRouteDraftStop[],
  origin: GeoPoint | null
): FacilityRouteDraftStop[] {
  if (!origin) return [...stops];

  const scored = stops.map((stop, index) => {
    const dist = stopDistanceMiles(origin, stop);
    const distPenalty = dist != null ? dist * 8 : 500;
    const boost =
      stop.portalStatus === "already_in_portal" || stop.facilityId
        ? followUpScore(stop.nextFollowUpAt) + priorityScore(stop.priority)
        : 0;
    return { stop, index, score: boost - distPenalty };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((s) => s.stop);
}

export function formatRouteListForCopy(stops: FacilityRouteDraftStop[]): string {
  const lines: string[] = ["Saintly Route Plan", ""];
  let n = 0;
  for (const stop of stops) {
    if (stop.visitState === "skipped") continue;
    n += 1;
    lines.push(`${n}. ${stop.name}`);
    if (stop.address?.trim()) {
      lines.push(`   Address: ${stop.address.trim()}`);
    }
    if (stop.phone?.trim()) {
      lines.push(`   Phone: ${stop.phone.trim()}`);
    }
    const status =
      stop.facilityId || stop.portalStatus === "already_in_portal"
        ? "In Portal"
        : stop.source === "google_places"
          ? "Google Place — not in portal yet"
          : "Not in portal";
    lines.push(`   Status: ${status}`);
    if (stop.notes?.trim()) {
      lines.push(`   Notes: ${stop.notes.trim()}`);
    }
    lines.push("");
  }
  if (n === 0) {
    lines.push("(No active stops)");
  }
  return lines.join("\n").trim();
}

export function enrichStopsWithNumbers(
  stops: FacilityRouteDraftStop[],
  origin: GeoPoint | null
): EnrichedRouteStop[] {
  return stops.map((stop, i) => {
    const distanceMiles = stopDistanceMiles(origin, stop);
    return {
      ...stop,
      stopNumber: i + 1,
      distanceMiles,
      distanceLabel: formatDistanceMiles(distanceMiles),
    };
  });
}

export function findNextPendingStopIndex(stops: FacilityRouteDraftStop[]): number {
  return stops.findIndex((s) => s.visitState !== "visited" && s.visitState !== "skipped");
}
