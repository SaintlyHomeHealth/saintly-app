/**
 * Apple Maps deep links for field reps (iOS-friendly directions).
 */

import type { GeoPoint } from "@/lib/crm/facility-geolocation";

export function appleMapsDirectionsUrl(opts: {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const lat = opts.latitude;
  const lng = opts.longitude;
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }
  const address = (opts.address ?? "").trim();
  if (!address) return null;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`;
}

export function appleMapsDirectionsFromPoint(origin: GeoPoint, dest: GeoPoint): string {
  return `https://maps.apple.com/?saddr=${origin.latitude},${origin.longitude}&daddr=${dest.latitude},${dest.longitude}&dirflg=d`;
}
