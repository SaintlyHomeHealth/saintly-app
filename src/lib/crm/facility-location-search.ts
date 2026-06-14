/**
 * Shared radius + location labeling for Facility Finder / Discover.
 */

import {
  formatDistanceMiles,
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";

export const FACILITY_RADIUS_OPTIONS = [5, 10, 15, 25, 50] as const;
export type FacilityRadiusOption = (typeof FACILITY_RADIUS_OPTIONS)[number];

/** `null` means no radius limit (All). */
export function normalizeRadiusMiles(input: unknown): number | null {
  if (input === null || input === undefined || input === "all" || input === 0) {
    return null;
  }
  const n = typeof input === "number" ? input : Number(input);
  if (FACILITY_RADIUS_OPTIONS.includes(n as FacilityRadiusOption)) {
    return n;
  }
  return 15;
}

export function distanceFromAgentMiles(
  agentLocation: GeoPoint | null,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): number | null {
  if (!agentLocation) return null;
  if (!isValidGeoPoint({ latitude: latitude ?? NaN, longitude: longitude ?? NaN })) {
    return null;
  }
  return haversineDistanceMiles(agentLocation, {
    latitude: latitude!,
    longitude: longitude!,
  });
}

/** Returns false when coords are missing or outside radius (near-me mode). */
export function isWithinRadiusMiles(
  agentLocation: GeoPoint | null,
  radiusMiles: number | null,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  if (radiusMiles == null || !agentLocation) return true;
  const dist = distanceFromAgentMiles(agentLocation, latitude, longitude);
  if (dist == null) return false;
  return dist <= radiusMiles;
}

export function formatFacilitySearchBasisLabel(opts: {
  radiusMiles: number | null;
  locationAvailable: boolean;
  city?: string | null;
  nearMe?: boolean;
}): string {
  const { radiusMiles, locationAvailable, city, nearMe } = opts;
  const cityLabel = (city ?? "").trim();

  if (locationAvailable && radiusMiles != null) {
    return `Searching within ${radiusMiles} miles of your current location`;
  }
  if (locationAvailable && radiusMiles == null) {
    return "Showing all portal facilities sorted by distance from your current location";
  }
  if (!locationAvailable && cityLabel) {
    return radiusMiles != null
      ? `Location unavailable — showing portal facilities matching ${cityLabel} (enable location to filter by distance)`
      : `Showing all portal facilities matching ${cityLabel}. Enable location to filter by distance.`;
  }
  if (!locationAvailable && nearMe) {
    return "Location unavailable — showing all portal facilities. Enable location to filter by distance.";
  }
  if (!locationAvailable) {
    return "Location unavailable — showing all portal facilities. Enable location to filter by distance.";
  }
  if (cityLabel) {
    return `Searching near ${cityLabel}`;
  }
  return "Showing all portal facilities";
}

export function buildGooglePlacesTextQuery(opts: {
  queryRaw: string;
  cityOverride?: string | null;
  parsedText?: string;
  parsedCity?: string | null;
  nearMe?: boolean;
  fieldFilterLabel?: string | null;
}): string {
  const parts: string[] = [];
  const raw = opts.queryRaw.trim();
  if (raw) parts.push(raw);
  else if (opts.parsedText?.trim()) parts.push(opts.parsedText.trim());

  const city = (opts.cityOverride ?? opts.parsedCity ?? "").trim();
  if (city && !raw.toLowerCase().includes(city.toLowerCase())) {
    parts.push(`in ${city}`);
  }

  if (opts.nearMe && parts.every((p) => !/near me/i.test(p))) {
    parts.push("near me");
  }

  const joined = parts.join(" ").trim();
  if (joined) return joined.replace(/\bnear me\b/gi, "").replace(/\s+/g, " ").trim() || joined;

  if (opts.nearMe) return "healthcare medical offices";
  if (city) return `medical offices in ${city}`;
  if (opts.fieldFilterLabel) return `${opts.fieldFilterLabel} medical offices`;
  return "medical offices";
}
