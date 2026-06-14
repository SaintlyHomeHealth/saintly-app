import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  filterFacilitiesForFinder,
  getFieldFilterById,
  type FacilityFieldFilterId,
  type FacilitySearchRow,
  parseFacilityFinderQuery,
} from "@/lib/crm/facility-finder-query";
import {
  distanceFromAgentMiles,
  isWithinRadiusMiles,
  searchGooglePlacesForDiscovery,
} from "@/lib/crm/facility-discover-google";
import { formatDistanceMiles, isValidGeoPoint, type GeoPoint } from "@/lib/crm/facility-geolocation";
import { buildGooglePlacesTextQuery, normalizeRadiusMiles } from "@/lib/crm/facility-location-search";
import { type PortalFacilityForMatch } from "@/lib/crm/facility-match";
import { isGooglePlacesConfigured } from "@/lib/google/places";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type DiscoverMatchStatus = "already_in_portal" | "possible_match" | "not_in_portal";

export type DiscoverPortalResult = {
  match_status: "already_in_portal";
  source: "saintly_portal";
  facility_id: string;
  name: string;
  type: string | null;
  city: string | null;
  formatted_address: string;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_miles: number | null;
  distance_label: string;
  matched_facility_id: string;
  matched_facility_name: string;
  match_confidence: number;
  match_reason: string;
};

export type DiscoverExternalResult = {
  match_status: DiscoverMatchStatus;
  source: "google_places";
  google_place_id: string;
  name: string;
  type: string | null;
  formatted_address: string;
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  rating: number | null;
  open_now: boolean | null;
  distance_miles: number | null;
  distance_label: string;
  matched_facility_id: string | null;
  matched_facility_name: string | null;
  match_confidence: number;
  match_reason: string;
};

export type DiscoverResponse = {
  portal_results: DiscoverPortalResult[];
  external_results: DiscoverExternalResult[];
  possible_matches: DiscoverExternalResult[];
  normalized_query: {
    query: string;
    city: string | null;
    near_me: boolean;
    field_filter: FacilityFieldFilterId | null;
    search_scope: "both" | "portal" | "google";
    radius_miles: number | null;
    max_results: number;
  };
  google_places_configured: boolean;
  errors: string[];
};

type DiscoverRequestBody = {
  query?: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius_miles?: number | null;
  max_results?: number;
  search_scope?: "both" | "portal" | "google";
  field_filter?: FacilityFieldFilterId | null;
};


export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: DiscoverRequestBody;
  try {
    body = (await req.json()) as DiscoverRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const queryRaw = (body.query ?? "").trim();
  const cityOverride = (body.city ?? "").trim() || null;
  const parsed = parseFacilityFinderQuery(queryRaw);
  const fieldFilter = body.field_filter ?? parsed.fieldFilterId ?? null;
  const searchScope = body.search_scope ?? "both";
  const radiusMiles = normalizeRadiusMiles(body.radius_miles ?? 15);
  const maxResults = [10, 20, 40].includes(body.max_results ?? 20)
    ? (body.max_results as number)
    : 20;

  const agentLocation: GeoPoint | null =
    typeof body.latitude === "number" &&
    typeof body.longitude === "number" &&
    isValidGeoPoint({ latitude: body.latitude, longitude: body.longitude })
      ? { latitude: body.latitude, longitude: body.longitude }
      : null;

  const errors: string[] = [];
  const googleConfigured = isGooglePlacesConfigured();

  const { data: facilityRows, error: facErr } = await supabaseAdmin
    .from("facilities")
    .select(
      "id, name, type, city, state, zip, main_phone, fax, email, website, address_line_1, address_line_2, general_notes, referral_notes, intake_notes, latitude, longitude, google_place_id, is_active"
    )
    .eq("is_active", true)
    .limit(2000);

  if (facErr) {
    console.warn("[api/facilities/discover] facilities:", facErr.message);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

type PortalRowForDiscover = PortalFacilityForMatch & {
  type: string | null;
  latitude: number | null;
  longitude: number | null;
};

  const portalForMatch = (facilityRows ?? []) as PortalRowForDiscover[];
  const enriched: FacilitySearchRow[] = (facilityRows ?? []).map((r) => ({
    ...(r as unknown as FacilitySearchRow),
    contact_names: [],
    activity_note_snippets: [],
  }));

  const effectiveCity = cityOverride ?? parsed.city;
  const portalParsed = {
    ...parsed,
    city: effectiveCity,
  };

  let portalFiltered = filterFacilitiesForFinder(enriched, portalParsed, fieldFilter);

  if (radiusMiles != null && agentLocation) {
    portalFiltered = portalFiltered.filter((row) =>
      isWithinRadiusMiles(agentLocation, radiusMiles, row.latitude, row.longitude)
    );
  }

  portalFiltered = portalFiltered.slice(0, maxResults);

  const portalIdSet = new Set<string>();
  const portal_results: DiscoverPortalResult[] = [];

  if (searchScope === "both" || searchScope === "portal") {
    for (const row of portalFiltered) {
      const distanceMiles = distanceFromAgentMiles(agentLocation, row.latitude, row.longitude);

      portalIdSet.add(row.id);
      portal_results.push({
        match_status: "already_in_portal",
        source: "saintly_portal",
        facility_id: row.id,
        name: row.name,
        type: row.type,
        city: row.city,
        formatted_address: buildFacilityFullAddress(row),
        phone: row.main_phone,
        website: row.website ?? null,
        latitude: row.latitude,
        longitude: row.longitude,
        distance_miles: distanceMiles,
        distance_label: formatDistanceMiles(distanceMiles),
        matched_facility_id: row.id,
        matched_facility_name: row.name,
        match_confidence: 1,
        match_reason: "Already in Saintly portal",
      });
    }

    if (agentLocation) {
      portal_results.sort((a, b) => {
        if (a.distance_miles == null && b.distance_miles == null) return a.name.localeCompare(b.name);
        if (a.distance_miles == null) return 1;
        if (b.distance_miles == null) return -1;
        return a.distance_miles - b.distance_miles;
      });
    }
  }

  const external_results: DiscoverExternalResult[] = [];
  const possible_matches: DiscoverExternalResult[] = [];

  if (searchScope === "both" || searchScope === "google") {
    const textQuery = buildGooglePlacesTextQuery({
      queryRaw,
      cityOverride,
      parsedText: parsed.text,
      parsedCity: parsed.city,
      nearMe: parsed.nearMe,
      fieldFilterLabel: fieldFilter ? getFieldFilterById(fieldFilter)?.label ?? null : null,
    });
    const googleSearch = await searchGooglePlacesForDiscovery({
      textQuery,
      agentLocation,
      radiusMiles,
      maxResults,
      portalForMatch,
      portalIdSet,
      portalResults: portal_results,
    });
    external_results.push(...googleSearch.externalResults);
    possible_matches.push(...googleSearch.possibleMatches);
    errors.push(...googleSearch.errors);
  }

  if (
    portal_results.length === 0 &&
    external_results.length === 0 &&
    possible_matches.length === 0 &&
    errors.length === 0
  ) {
    errors.push("No results found. Try a different search or widen your radius.");
  }

  const payload: DiscoverResponse = {
    portal_results,
    external_results,
    possible_matches,
    normalized_query: {
      query: queryRaw,
      city: effectiveCity,
      near_me: parsed.nearMe,
      field_filter: fieldFilter,
      search_scope: searchScope,
      radius_miles: radiusMiles,
      max_results: maxResults,
    },
    google_places_configured: googleConfigured,
    errors,
  };

  return NextResponse.json(payload);
}
