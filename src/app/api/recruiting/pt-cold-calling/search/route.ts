import { NextResponse } from "next/server";

import {
  distanceFromAgentMiles,
  isWithinRadiusMiles,
  normalizeRadiusMiles,
} from "@/lib/crm/facility-location-search";
import { formatDistanceMiles, isValidGeoPoint, type GeoPoint } from "@/lib/crm/facility-geolocation";
import { searchGooglePlaces, isGooglePlacesConfigured } from "@/lib/google/places";
import { geocodeAddressWithMapbox } from "@/lib/mapbox/geocode-address";
import {
  buildPtColdCallTextQuery,
  isPtColdCallSearchMode,
  PT_COLD_CALL_SEARCH_MODE_KEYWORD,
  PT_COLD_CALL_SEARCH_MODE_ZIP,
  PT_COLD_CALL_SEARCH_TYPE_ANY,
  ptColdCallGoogleMapsUrl,
  ptColdCallPlaceHasAddress,
} from "@/lib/recruiting/pt-cold-call-google";
import { matchExternalAgainstTargets } from "@/lib/recruiting/pt-cold-call-match";
import { fetchTargetsForMatch, fetchLatestLog } from "@/lib/recruiting/pt-cold-call-store";
import { PT_COLD_CALL_SEARCH_TYPES } from "@/lib/recruiting/pt-cold-call-options";
import type { PtColdCallSearchResponse, PtColdCallSearchResult } from "@/lib/recruiting/pt-cold-call-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type SearchRequestBody = {
  search_mode?: string;
  search_type?: string;
  keyword?: string;
  zip_code?: string;
  radius_miles?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  max_results?: number;
};

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: SearchRequestBody;
  try {
    body = (await req.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const searchModeRaw = (body.search_mode ?? PT_COLD_CALL_SEARCH_MODE_ZIP).trim();
  const searchMode = isPtColdCallSearchMode(searchModeRaw) ? searchModeRaw : PT_COLD_CALL_SEARCH_MODE_ZIP;

  const searchTypeRaw = (body.search_type ?? PT_COLD_CALL_SEARCH_TYPE_ANY).trim();
  const searchType =
    searchTypeRaw === PT_COLD_CALL_SEARCH_TYPE_ANY
      ? PT_COLD_CALL_SEARCH_TYPE_ANY
      : PT_COLD_CALL_SEARCH_TYPES.includes(searchTypeRaw as (typeof PT_COLD_CALL_SEARCH_TYPES)[number])
        ? searchTypeRaw
        : PT_COLD_CALL_SEARCH_TYPE_ANY;

  const keyword = (body.keyword ?? "").trim();
  const zip = (body.zip_code ?? "").trim();
  const radiusMiles = normalizeRadiusMiles(body.radius_miles ?? 10);
  const maxResults = [10, 20, 40].includes(body.max_results ?? 20) ? (body.max_results as number) : 20;

  const textQuery = buildPtColdCallTextQuery({
    search_mode: searchMode,
    keyword,
    search_type: searchType,
    zip_code: zip,
  });

  const errors: string[] = [];
  const googleConfigured = isGooglePlacesConfigured();

  if (!textQuery) {
    const hint =
      searchMode === PT_COLD_CALL_SEARCH_MODE_KEYWORD
        ? "Enter a business name or keyword to search (e.g. “At Home Therapy” or “physical therapy phoenix in home”)."
        : "Enter a ZIP code, keyword, or search type to run a nearby clinic search.";
    return NextResponse.json({
      results: [],
      google_places_configured: googleConfigured,
      normalized_query: {
        search_mode: searchMode,
        search_type: searchType,
        keyword: keyword || null,
        zip_code: zip || null,
        radius_miles: radiusMiles,
      },
      errors: [hint],
    } satisfies PtColdCallSearchResponse);
  }

  // Location bias center: explicit coords, or geocoded ZIP when provided.
  let agentLocation: GeoPoint | null =
    typeof body.latitude === "number" &&
    typeof body.longitude === "number" &&
    isValidGeoPoint({ latitude: body.latitude, longitude: body.longitude })
      ? { latitude: body.latitude, longitude: body.longitude }
      : null;

  if (!agentLocation && zip) {
    const point = await geocodeAddressWithMapbox(`${zip} USA`);
    if (point) agentLocation = point;
  }

  if (!googleConfigured) {
    const payload: PtColdCallSearchResponse = {
      results: [],
      google_places_configured: false,
      normalized_query: {
        search_mode: searchMode,
        search_type: searchType,
        keyword: keyword || null,
        zip_code: zip || null,
        radius_miles: radiusMiles,
      },
      errors: ["Google Places is not configured yet. Add GOOGLE_PLACES_API_KEY to enable clinic search."],
    };
    return NextResponse.json(payload);
  }

  const googleSearch = await searchGooglePlaces({
    textQuery,
    latitude: agentLocation?.latitude ?? null,
    longitude: agentLocation?.longitude ?? null,
    radiusMiles: radiusMiles ?? undefined,
    maxResults,
    requireFormattedAddress: false,
  });

  if (googleSearch.error) {
    const map: Record<string, string> = {
      not_configured: "Google Places is not configured yet.",
      quota_exceeded: "Google Places quota reached. Try again shortly.",
      upstream_error: "Google Places is temporarily unavailable. Try again.",
      invalid_request: "Could not run that search. Adjust your search and try again.",
    };
    errors.push(map[googleSearch.error] ?? "Google Places search failed.");
  }

  const targets = await fetchTargetsForMatch();
  const hardRadiusFilter = searchMode === PT_COLD_CALL_SEARCH_MODE_ZIP;

  const results: PtColdCallSearchResult[] = [];
  for (const place of googleSearch.results) {
    // Keyword mode: ZIP/radius is bias only — never drop results outside the circle.
    // ZIP mode: only apply radius when the listing has coordinates.
    if (
      hardRadiusFilter &&
      radiusMiles != null &&
      agentLocation &&
      place.latitude != null &&
      place.longitude != null &&
      !isWithinRadiusMiles(agentLocation, radiusMiles, place.latitude, place.longitude)
    ) {
      continue;
    }

    const hasAddress = ptColdCallPlaceHasAddress(place);

    const match = matchExternalAgainstTargets(
      {
        google_place_id: place.google_place_id,
        clinic_name: place.name,
        formatted_address: place.formatted_address,
        phone: place.phone,
        website: place.website,
        city: place.city,
      },
      targets
    );

    let matchedLatestNote: string | null = null;
    if (match.matched_target_id) {
      const latest = await fetchLatestLog(match.matched_target_id);
      matchedLatestNote = latest?.notes ?? null;
    }

    const distanceMiles = distanceFromAgentMiles(agentLocation, place.latitude, place.longitude);

    results.push({
      google_place_id: place.google_place_id,
      clinic_name: place.name,
      formatted_address: place.formatted_address,
      address_line_1: place.address_line_1,
      city: place.city,
      state: place.state,
      zip: place.zip,
      phone: place.phone,
      website: place.website,
      latitude: place.latitude,
      longitude: place.longitude,
      google_rating: place.rating,
      google_review_count: place.review_count,
      google_maps_url: ptColdCallGoogleMapsUrl(place.google_place_id, place.name, place.formatted_address),
      has_address: hasAddress,
      distance_miles: distanceMiles,
      distance_label: formatDistanceMiles(distanceMiles),
      match_status: match.match_status,
      matched_target_id: match.matched_target_id,
      matched_target_name: match.matched_target_name,
      matched_status: match.matched_status,
      matched_last_called_at: match.matched_last_called_at,
      matched_next_follow_up_at: match.matched_next_follow_up_at,
      matched_latest_note: matchedLatestNote,
      match_reason: match.match_reason,
    });
  }

  if (agentLocation) {
    results.sort((a, b) => {
      if (a.distance_miles == null && b.distance_miles == null) return a.clinic_name.localeCompare(b.clinic_name);
      if (a.distance_miles == null) return 1;
      if (b.distance_miles == null) return -1;
      return a.distance_miles - b.distance_miles;
    });
  }

  if (results.length === 0 && errors.length === 0) {
    errors.push(
      searchMode === PT_COLD_CALL_SEARCH_MODE_KEYWORD
        ? "No results for that keyword. Try the exact business name or a broader phrase."
        : "No clinics found. Try a wider radius, a different ZIP, or switch to keyword search."
    );
  }

  const payload: PtColdCallSearchResponse = {
    results,
    google_places_configured: googleConfigured,
    normalized_query: {
      search_mode: searchMode,
      search_type: searchType,
      keyword: keyword || null,
      zip_code: zip || null,
      radius_miles: radiusMiles,
    },
    errors,
  };

  return NextResponse.json(payload);
}
