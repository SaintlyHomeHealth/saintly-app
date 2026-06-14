/**
 * Google Places API (New) — server-side text search for facility discovery.
 * @see https://developers.google.com/maps/documentation/places/web-service/text-search
 */

import { parseUsFormattedAddress } from "@/lib/crm/facility-match";
import { isValidFacilityType, type FacilityTypeOption } from "@/lib/crm/facility-options";

export type GooglePlacesSearchResult = {
  google_place_id: string;
  name: string;
  formatted_address: string;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  rating: number | null;
  open_now: boolean | null;
  source: "google_places";
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
  suggested_type: string | null;
};

type GooglePlacesErrorCode =
  | "not_configured"
  | "quota_exceeded"
  | "upstream_error"
  | "invalid_request";

export type GooglePlacesSearchResponse = {
  results: GooglePlacesSearchResult[];
  error: GooglePlacesErrorCode | null;
};

function getGooglePlacesApiKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

const TYPE_TO_FACILITY: Record<string, FacilityTypeOption> = {
  podiatrist: "Podiatry Office",
  doctor: "Primary Care Office",
  hospital: "Hospital",
  physiotherapist: "Rehab Hospital",
  nursing_home: "Skilled Nursing Facility",
  hospice: "Hospice",
  health: "Other",
};

export function mapGoogleCategoriesToFacilityType(categories: string[]): string | null {
  for (const cat of categories) {
    const key = cat.toLowerCase().replace(/\s+/g, "_");
    const mapped = TYPE_TO_FACILITY[key];
    if (mapped && isValidFacilityType(mapped)) return mapped;
  }

  const blob = categories.join(" ").toLowerCase();
  if (blob.includes("podiatr")) return "Podiatry Office";
  if (blob.includes("wound")) return "Wound Clinic";
  if (blob.includes("pain")) return "Pain Management";
  if (blob.includes("hospice")) return "Hospice";
  if (blob.includes("assisted") || blob.includes("senior")) return "Assisted Living";
  if (blob.includes("pediatric")) return "Other";
  if (blob.includes("primary") || blob.includes("family")) return "Primary Care Office";
  if (blob.includes("hospital")) return "Hospital";
  if (blob.includes("rehab") || blob.includes("skilled")) return "Skilled Nursing Facility";

  return null;
}

type RawGooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
};

export async function searchGooglePlaces(opts: {
  textQuery: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number;
  maxResults?: number;
}): Promise<GooglePlacesSearchResponse> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return { results: [], error: "not_configured" };
  }

  const textQuery = opts.textQuery.trim();
  if (!textQuery) {
    return { results: [], error: "invalid_request" };
  }

  const maxResultCount = Math.min(40, Math.max(1, opts.maxResults ?? 20));
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount,
    languageCode: "en",
    regionCode: "US",
  };

  if (
    typeof opts.latitude === "number" &&
    typeof opts.longitude === "number" &&
    Number.isFinite(opts.latitude) &&
    Number.isFinite(opts.longitude)
  ) {
    const radiusMeters = Math.round((opts.radiusMiles ?? 15) * 1609.34);
    body.locationBias = {
      circle: {
        center: { latitude: opts.latitude, longitude: opts.longitude },
        radius: radiusMeters,
      },
    };
  }

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.types",
    "places.rating",
    "places.currentOpeningHours.openNow",
  ].join(",");

  let res: Response;
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn("[google/places] fetch failed", e);
    return { results: [], error: "upstream_error" };
  }

  if (res.status === 429) {
    return { results: [], error: "quota_exceeded" };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("[google/places] status", res.status, errText.slice(0, 200));
    return { results: [], error: "upstream_error" };
  }

  let json: { places?: RawGooglePlace[] };
  try {
    json = (await res.json()) as { places?: RawGooglePlace[] };
  } catch {
    return { results: [], error: "upstream_error" };
  }

  const results: GooglePlacesSearchResult[] = [];
  for (const place of json.places ?? []) {
    const rawId = (place.id ?? "").trim();
    if (!rawId) continue;
    const google_place_id = rawId.startsWith("places/") ? rawId.slice("places/".length) : rawId;
    const name = (place.displayName?.text ?? "").trim();
    const formatted_address = (place.formattedAddress ?? "").trim();
    if (!name || !formatted_address) continue;

    const parsed = parseUsFormattedAddress(formatted_address);
    const categories = place.types ?? [];
    const phone =
      (place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "").trim() || null;

    results.push({
      google_place_id,
      name,
      formatted_address,
      phone,
      website: (place.websiteUri ?? "").trim() || null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      categories,
      rating: typeof place.rating === "number" ? place.rating : null,
      open_now:
        typeof place.currentOpeningHours?.openNow === "boolean"
          ? place.currentOpeningHours.openNow
          : null,
      source: "google_places",
      address_line_1: parsed.address_line_1,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      suggested_type: mapGoogleCategoriesToFacilityType(categories),
    });
  }

  return { results, error: null };
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(getGooglePlacesApiKey());
}
