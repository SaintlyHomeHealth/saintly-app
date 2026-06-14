import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  filterFacilitiesForFinder,
  type FacilityFieldFilterId,
  type FacilitySearchRow,
  parseFacilityFinderQuery,
} from "@/lib/crm/facility-finder-query";
import {
  formatDistanceMiles,
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";
import {
  matchExternalPlaceAgainstPortal,
  type PortalFacilityForMatch,
} from "@/lib/crm/facility-match";
import { isGooglePlacesConfigured, searchGooglePlaces } from "@/lib/google/places";
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
    radius_miles: number;
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
  radius_miles?: number;
  max_results?: number;
  search_scope?: "both" | "portal" | "google";
  field_filter?: FacilityFieldFilterId | null;
};

function buildTextQuery(
  queryRaw: string,
  cityOverride: string | null,
  parsed: ReturnType<typeof parseFacilityFinderQuery>
): string {
  const parts: string[] = [];
  if (queryRaw.trim()) parts.push(queryRaw.trim());
  else if (parsed.text) parts.push(parsed.text);

  const city = (cityOverride ?? parsed.city ?? "").trim();
  if (city && !queryRaw.toLowerCase().includes(city.toLowerCase())) {
    parts.push(`in ${city}`);
  }

  if (parsed.nearMe && parts.every((p) => !/near me/i.test(p))) {
    parts.push("near me");
  }

  const joined = parts.join(" ").trim();
  return joined || "medical offices Arizona";
}

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
  const radiusMiles = [5, 10, 15, 25].includes(body.radius_miles ?? 15)
    ? (body.radius_miles as number)
    : 15;
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
    portalFiltered = portalFiltered.filter((row) => {
      if (!isValidGeoPoint({ latitude: row.latitude ?? NaN, longitude: row.longitude ?? NaN })) {
        return true;
      }
      return (
        haversineDistanceMiles(agentLocation, {
          latitude: row.latitude!,
          longitude: row.longitude!,
        }) <= radiusMiles
      );
    });
  }

  portalFiltered = portalFiltered.slice(0, maxResults);

  const portalIdSet = new Set<string>();
  const portal_results: DiscoverPortalResult[] = [];

  if (searchScope === "both" || searchScope === "portal") {
    for (const row of portalFiltered) {
      const distanceMiles =
        agentLocation &&
        isValidGeoPoint({ latitude: row.latitude ?? NaN, longitude: row.longitude ?? NaN })
          ? haversineDistanceMiles(agentLocation, {
              latitude: row.latitude!,
              longitude: row.longitude!,
            })
          : null;

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
    if (!googleConfigured) {
      errors.push("Google Places is not configured yet. Portal results only.");
    } else {
      const textQuery = buildTextQuery(queryRaw, cityOverride, parsed);
      const google = await searchGooglePlaces({
        textQuery,
        latitude: agentLocation?.latitude ?? null,
        longitude: agentLocation?.longitude ?? null,
        radiusMiles,
        maxResults,
      });

      if (google.error === "quota_exceeded") {
        errors.push("Google Places quota exceeded. Try again later or search portal only.");
      } else if (google.error === "upstream_error") {
        errors.push("Google Places search failed. Portal results may still be available.");
      } else if (google.error === "invalid_request") {
        errors.push("Enter a search query to discover facilities.");
      }

      for (const place of google.results) {
        const match = matchExternalPlaceAgainstPortal(
          {
            google_place_id: place.google_place_id,
            name: place.name,
            formatted_address: place.formatted_address,
            phone: place.phone,
            website: place.website,
            city: place.city,
          },
          portalForMatch
        );

        const distanceMiles =
          agentLocation &&
          typeof place.latitude === "number" &&
          typeof place.longitude === "number"
            ? haversineDistanceMiles(agentLocation, {
                latitude: place.latitude,
                longitude: place.longitude,
              })
            : null;

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
          if (!portalIdSet.has(match.matched_facility_id)) {
            const f = portalForMatch.find((p) => p.id === match.matched_facility_id);
            if (f) {
              portalIdSet.add(f.id);
              portal_results.push({
                match_status: "already_in_portal",
                source: "saintly_portal",
                facility_id: f.id,
                name: f.name,
                type: f.type ?? place.suggested_type,
                city: f.city,
                formatted_address: buildFacilityFullAddress(f),
                phone: f.main_phone,
                website: f.website,
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
          possible_matches.push(card);
        } else {
          external_results.push(card);
        }
      }
    }
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
