/**
 * Mapbox Geocoding API v5 returns GeoJSON Features; we extract US mailing fields.
 * @see https://docs.mapbox.com/api/search/geocoding/
 */
export type MapboxGeocodeContext = {
  id: string;
  text: string;
  short_code?: string;
};

export type MapboxGeocodeFeature = {
  id: string;
  place_name: string;
  text?: string;
  address?: string;
  place_type?: string[];
  context?: MapboxGeocodeContext[];
};

export type ParsedUsAddress = {
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
};

function firstLineFromPlaceName(placeName: string): string {
  const seg = placeName.split(",")[0]?.trim() ?? "";
  return seg;
}

/**
 * Parses a Mapbox `address` feature into structured US fields.
 * Falls back to the first segment of `place_name` when street parts are missing.
 */
export function parseUsAddressFromMapboxFeature(feature: MapboxGeocodeFeature): ParsedUsAddress | null {
  const num = (feature.address ?? "").trim();
  const street = (feature.text ?? "").trim();
  let address_line_1 = [num, street].filter(Boolean).join(" ").trim();
  if (!address_line_1) {
    address_line_1 = firstLineFromPlaceName(feature.place_name);
  }
  if (!address_line_1) return null;

  let city = "";
  let state = "";
  let zip = "";

  for (const c of feature.context ?? []) {
    if (c.id.startsWith("place.")) {
      city = c.text;
    } else if (c.id.startsWith("locality.") && !city) {
      city = c.text;
    } else if (c.id.startsWith("region.")) {
      const sc = (c.short_code ?? "").trim();
      state = sc.startsWith("US-") ? sc.slice(3) : c.text;
    } else if (c.id.startsWith("postcode.")) {
      zip = c.text;
    }
  }

  return { address_line_1, city, state, zip };
}
