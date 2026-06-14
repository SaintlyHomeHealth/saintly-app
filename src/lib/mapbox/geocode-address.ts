/**
 * Forward geocode a US mailing address via Mapbox (server-side).
 */

import { buildFacilityFullAddress } from "@/lib/crm/facility-address";

export type GeocodedPoint = {
  latitude: number;
  longitude: number;
};

type MapboxFeature = {
  center?: [number, number];
  relevance?: number;
};

const GEOCODE_TIMEOUT_MS = 8_000;
const MAX_GEOCODE_BATCH = 20;

export async function geocodeAddressWithMapbox(fullAddress: string): Promise<GeocodedPoint | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const q = fullAddress.trim();
  if (!q) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: MapboxFeature[] };
    const feature = body.features?.[0];
    const center = feature?.center;
    if (!center || center.length < 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}

export type FacilityAddressParts = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function facilityAddressForGeocode(parts: FacilityAddressParts): string {
  return buildFacilityFullAddress(parts);
}

/**
 * Geocode facilities missing coordinates, up to `limit` per call.
 * Returns a map of facility id → geocoded point.
 */
export async function geocodeFacilitiesBatch<
  T extends FacilityAddressParts & { id: string; latitude?: number | null; longitude?: number | null },
>(facilities: T[], limit = MAX_GEOCODE_BATCH): Promise<Map<string, GeocodedPoint>> {
  const result = new Map<string, GeocodedPoint>();
  const needsGeocode = facilities.filter(
    (f) => f.latitude == null || f.longitude == null
  ).slice(0, limit);

  for (const f of needsGeocode) {
    const addr = facilityAddressForGeocode(f);
    if (!addr) continue;
    const point = await geocodeAddressWithMapbox(addr);
    if (point) result.set(f.id, point);
  }

  return result;
}

export { MAX_GEOCODE_BATCH };
