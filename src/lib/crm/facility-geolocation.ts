/**
 * Haversine distance helpers for field-sales facility finder.
 */

const EARTH_RADIUS_MILES = 3958.8;

export type GeoPoint = { latitude: number; longitude: number };

export function haversineDistanceMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return "—";
  if (miles < 0.1) return "< 0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function isValidGeoPoint(p: Partial<GeoPoint> | null | undefined): p is GeoPoint {
  if (!p) return false;
  const { latitude, longitude } = p;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
