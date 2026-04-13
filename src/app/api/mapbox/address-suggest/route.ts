import { NextResponse } from "next/server";

import { getStaffProfile } from "@/lib/staff-profile";
import {
  parseUsAddressFromMapboxFeature,
  type MapboxGeocodeFeature,
} from "@/lib/mapbox/parse-geocode-feature";

const MIN_QUERY_LEN = 3;
const MAX_RESULTS = 8;

type Suggestion = {
  id: string;
  label: string;
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
};

/**
 * Proxies Mapbox forward geocoding for US address autocomplete (staff only).
 * Token stays server-side (`MAPBOX_ACCESS_TOKEN`).
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || staff.is_active === false) {
    return NextResponse.json({ error: "forbidden" as const }, { status: 403 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "mapbox_not_configured" as const }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ suggestions: [] satisfies Suggestion[] });
  }

  const pathSegment = encodeURIComponent(q);
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${pathSegment}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "US");
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("language", "en");
  url.searchParams.set("autocomplete", "true");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn("[api/mapbox/address-suggest] fetch failed", e);
    return NextResponse.json({ error: "upstream" as const }, { status: 502 });
  }

  if (!res.ok) {
    console.warn("[api/mapbox/address-suggest] mapbox status", res.status);
    return NextResponse.json({ error: "mapbox_error" as const }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return NextResponse.json({ error: "invalid_response" as const }, { status: 502 });
  }

  const features = (body as { features?: MapboxGeocodeFeature[] }).features ?? [];
  const suggestions: Suggestion[] = [];

  for (const f of features) {
    if (!f?.id || typeof f.place_name !== "string") continue;
    const parsed = parseUsAddressFromMapboxFeature(f);
    if (!parsed) continue;
    suggestions.push({
      id: f.id,
      label: f.place_name,
      address_line_1: parsed.address_line_1,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
    });
  }

  return NextResponse.json({ suggestions });
}
