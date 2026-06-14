/**
 * Server-side Google Places discovery merged with portal match status.
 */

import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import type {
  DiscoverExternalResult,
  DiscoverPortalResult,
} from "@/app/api/facilities/discover/route";
import {
  distanceFromAgentMiles,
  isWithinRadiusMiles,
} from "@/lib/crm/facility-location-search";
import { formatDistanceMiles, type GeoPoint } from "@/lib/crm/facility-geolocation";
import {
  matchExternalPlaceAgainstPortal,
  type PortalFacilityForMatch,
} from "@/lib/crm/facility-match";
import { isGooglePlacesConfigured, searchGooglePlaces } from "@/lib/google/places";

export async function searchGooglePlacesForDiscovery(opts: {
  textQuery: string;
  agentLocation: GeoPoint | null;
  radiusMiles: number | null;
  maxResults: number;
  portalForMatch: Array<
    PortalFacilityForMatch & {
      type?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  >;
  portalIdSet: Set<string>;
  portalResults: DiscoverPortalResult[];
}): Promise<{
  externalResults: DiscoverExternalResult[];
  possibleMatches: DiscoverExternalResult[];
  errors: string[];
}> {
  const errors: string[] = [];
  const externalResults: DiscoverExternalResult[] = [];
  const possibleMatches: DiscoverExternalResult[] = [];

  if (!isGooglePlacesConfigured()) {
    errors.push("Google Places is not configured yet. Portal results only.");
    return { externalResults, possibleMatches, errors };
  }

  const google = await searchGooglePlaces({
    textQuery: opts.textQuery,
    latitude: opts.agentLocation?.latitude ?? null,
    longitude: opts.agentLocation?.longitude ?? null,
    radiusMiles: opts.radiusMiles ?? 50,
    maxResults: opts.maxResults,
  });

  if (google.error === "quota_exceeded") {
    errors.push("Google Places quota exceeded. Try again later or search portal only.");
    return { externalResults, possibleMatches, errors };
  }
  if (google.error === "upstream_error") {
    errors.push("Google Places search failed. Portal results may still be available.");
    return { externalResults, possibleMatches, errors };
  }
  if (google.error === "invalid_request") {
    errors.push("Enter a search query to discover facilities.");
    return { externalResults, possibleMatches, errors };
  }

  for (const place of google.results) {
    const distanceMiles = distanceFromAgentMiles(
      opts.agentLocation,
      place.latitude,
      place.longitude
    );

    if (
      opts.radiusMiles != null &&
      opts.agentLocation &&
      (distanceMiles == null || distanceMiles > opts.radiusMiles)
    ) {
      continue;
    }

    const match = matchExternalPlaceAgainstPortal(
      {
        google_place_id: place.google_place_id,
        name: place.name,
        formatted_address: place.formatted_address,
        phone: place.phone,
        website: place.website,
        city: place.city,
      },
      opts.portalForMatch
    );

    const card: DiscoverExternalResult = {
      match_status: match.match_status,
      source: "google_places",
      google_place_id: place.google_place_id,
      name: place.name,
      type: place.suggested_type,
      formatted_address: place.formatted_address,
      address_line_1: place.address_line_1,
      city: place.city,
      state: place.state,
      zip: place.zip,
      phone: place.phone,
      website: place.website,
      latitude: place.latitude,
      longitude: place.longitude,
      categories: place.categories,
      rating: place.rating,
      open_now: place.open_now,
      distance_miles: distanceMiles,
      distance_label: formatDistanceMiles(distanceMiles),
      matched_facility_id: match.matched_facility_id,
      matched_facility_name: match.matched_facility_name,
      match_confidence: match.match_confidence,
      match_reason: match.match_reason,
    };

    if (match.match_status === "already_in_portal" && match.matched_facility_id) {
      if (!opts.portalIdSet.has(match.matched_facility_id)) {
        const f = opts.portalForMatch.find((p) => p.id === match.matched_facility_id);
        if (f) {
          opts.portalIdSet.add(f.id);
          opts.portalResults.push({
            match_status: "already_in_portal",
            source: "saintly_portal",
            facility_id: f.id,
            name: f.name,
            type: f.type ?? place.suggested_type ?? null,
            city: f.city ?? null,
            formatted_address: buildFacilityFullAddress(f),
            phone: f.main_phone ?? null,
            website: f.website ?? null,
            latitude: f.latitude ?? place.latitude,
            longitude: f.longitude ?? place.longitude,
            distance_miles: distanceMiles,
            distance_label: formatDistanceMiles(distanceMiles),
            matched_facility_id: f.id,
            matched_facility_name: f.name,
            match_confidence: match.match_confidence,
            match_reason: match.match_reason,
          });
        }
      }
      continue;
    }

    if (match.match_status === "possible_match") {
      possibleMatches.push(card);
    } else {
      externalResults.push(card);
    }
  }

  return { externalResults, possibleMatches, errors };
}

export { isWithinRadiusMiles, distanceFromAgentMiles };
