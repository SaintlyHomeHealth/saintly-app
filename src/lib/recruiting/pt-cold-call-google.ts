/**
 * PT/PTA cold-calling Google Places query builder + result helpers.
 */

import type { GooglePlacesSearchResult } from "@/lib/google/places";

export const PT_COLD_CALL_ADDRESS_NOT_LISTED = "Address not listed on Google";

export const PT_COLD_CALL_SEARCH_MODE_ZIP = "zip_nearby" as const;
export const PT_COLD_CALL_SEARCH_MODE_KEYWORD = "keyword" as const;
export type PtColdCallSearchMode =
  | typeof PT_COLD_CALL_SEARCH_MODE_ZIP
  | typeof PT_COLD_CALL_SEARCH_MODE_KEYWORD;

/** Blank search type value — do not append a clinic category to the query. */
export const PT_COLD_CALL_SEARCH_TYPE_ANY = "";

export function isPtColdCallSearchMode(value: string): value is PtColdCallSearchMode {
  return value === PT_COLD_CALL_SEARCH_MODE_ZIP || value === PT_COLD_CALL_SEARCH_MODE_KEYWORD;
}

export function buildPtColdCallTextQuery(opts: {
  search_mode: PtColdCallSearchMode;
  keyword: string;
  search_type: string;
  zip_code: string;
}): string | null {
  const keyword = opts.keyword.trim();
  const searchType = opts.search_type.trim();
  const zip = opts.zip_code.trim();

  if (opts.search_mode === PT_COLD_CALL_SEARCH_MODE_KEYWORD) {
    // Exact keyword / business name — no category appended.
    return keyword || null;
  }

  // ZIP / nearby: combine keyword + optional category + optional ZIP.
  const parts: string[] = [];
  if (keyword) parts.push(keyword);
  if (searchType) parts.push(searchType);
  if (zip) {
    if (parts.length === 0) parts.push(zip);
    else parts.push(`in ${zip}`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export function ptColdCallPlaceHasAddress(place: Pick<GooglePlacesSearchResult, "formatted_address">): boolean {
  return Boolean((place.formatted_address ?? "").trim());
}

export function ptColdCallDisplayAddress(formattedAddress: string | null | undefined): string {
  const addr = (formattedAddress ?? "").trim();
  return addr || PT_COLD_CALL_ADDRESS_NOT_LISTED;
}

export function ptColdCallGoogleMapsUrl(placeId: string, clinicName: string, formattedAddress?: string | null): string {
  const id = placeId.trim();
  if (id) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id)}`;
  const q = (formattedAddress ?? "").trim() || clinicName.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
