import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  filterFacilitiesForFinder,
  type FacilityFieldFilterId,
  type FacilitySearchRow,
  facilityMatchExplanation,
  parseFacilityFinderQuery,
} from "@/lib/crm/facility-finder-query";
import {
  formatDistanceMiles,
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import { geocodeFacilitiesBatch } from "@/lib/mapbox/geocode-address";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityFinderResult = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  city: string | null;
  address: string;
  phone: string | null;
  fax: string | null;
  lastVisitAt: string | null;
  nextFollowUpAt: string | null;
  assignedRepUserId: string | null;
  assignedRepLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMiles: number | null;
  distanceLabel: string;
  matchExplanation: string | null;
};

export type FacilityFinderResponse = {
  results: FacilityFinderResult[];
  parsedQuery: ReturnType<typeof parseFacilityFinderQuery>;
  agentLocation: GeoPoint | null;
  geocodedCount: number;
  totalMatched: number;
};

type FinderRequestBody = {
  query?: string;
  fieldFilter?: FacilityFieldFilterId | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
};

function staffPrimaryLabel(s: { full_name: string | null; email: string | null }): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  return (s.email ?? "").trim() || "Staff";
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: FinderRequestBody;
  try {
    body = (await req.json()) as FinderRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const queryRaw = (body.query ?? "").trim();
  const parsed = parseFacilityFinderQuery(queryRaw);
  const explicitFilter = body.fieldFilter ?? null;

  const agentLocation: GeoPoint | null =
    typeof body.latitude === "number" &&
    typeof body.longitude === "number" &&
    isValidGeoPoint({ latitude: body.latitude, longitude: body.longitude })
      ? { latitude: body.latitude, longitude: body.longitude }
      : null;

  const radiusMiles =
    typeof body.radiusMiles === "number" && body.radiusMiles > 0 ? body.radiusMiles : null;

  const { data: facilityRows, error: facErr } = await supabaseAdmin
    .from("facilities")
    .select(
      "id, name, type, status, priority, city, state, zip, main_phone, fax, email, website, address_line_1, address_line_2, assigned_rep_user_id, last_visit_at, next_follow_up_at, visit_frequency, relationship_strength, general_notes, referral_notes, intake_notes, latitude, longitude, is_active"
    )
    .eq("is_active", true)
    .limit(2000);

  if (facErr) {
    console.warn("[api/facilities/finder] facilities:", facErr.message);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const baseRows = (facilityRows ?? []) as FacilitySearchRow[];
  const facilityIds = baseRows.map((r) => r.id);

  const contactNamesByFacility = new Map<string, string[]>();
  if (facilityIds.length > 0) {
    const { data: contacts } = await supabaseAdmin
      .from("facility_contacts")
      .select("facility_id, full_name, first_name, last_name")
      .in("facility_id", facilityIds)
      .eq("is_active", true)
      .limit(5000);

    for (const c of contacts ?? []) {
      const row = c as {
        facility_id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      };
      const name =
        (row.full_name ?? "").trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      if (!name) continue;
      const list = contactNamesByFacility.get(row.facility_id) ?? [];
      list.push(name);
      contactNamesByFacility.set(row.facility_id, list);
    }
  }

  const activityNotesByFacility = new Map<string, string[]>();
  if (facilityIds.length > 0 && queryRaw) {
    const { data: activities } = await supabaseAdmin
      .from("facility_activities")
      .select("facility_id, notes")
      .in("facility_id", facilityIds)
      .not("notes", "is", null)
      .order("activity_at", { ascending: false })
      .limit(3000);

    for (const a of activities ?? []) {
      const row = a as { facility_id: string; notes: string | null };
      const note = (row.notes ?? "").trim();
      if (!note) continue;
      const list = activityNotesByFacility.get(row.facility_id) ?? [];
      if (list.length < 5) list.push(note);
      activityNotesByFacility.set(row.facility_id, list);
    }
  }

  const enriched: FacilitySearchRow[] = baseRows.map((r) => ({
    ...r,
    contact_names: contactNamesByFacility.get(r.id) ?? [],
    activity_note_snippets: activityNotesByFacility.get(r.id) ?? [],
  }));

  let filtered = filterFacilitiesForFinder(enriched, parsed, explicitFilter);

  const needsGeocode = filtered.filter((f) => f.latitude == null || f.longitude == null);
  const geocoded = await geocodeFacilitiesBatch(needsGeocode);
  let geocodedCount = 0;

  if (geocoded.size > 0) {
    for (const [id, point] of geocoded) {
      geocodedCount += 1;
      const row = filtered.find((f) => f.id === id);
      if (row) {
        row.latitude = point.latitude;
        row.longitude = point.longitude;
      }
      void supabaseAdmin
        .from("facilities")
        .update({ latitude: point.latitude, longitude: point.longitude })
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.warn("[api/facilities/finder] geocode persist:", id, error.message);
        });
    }
  }

  if (radiusMiles != null && agentLocation) {
    filtered = filtered.filter((row) => {
      if (!isValidGeoPoint({ latitude: row.latitude ?? NaN, longitude: row.longitude ?? NaN })) {
        return false;
      }
      const dist = haversineDistanceMiles(agentLocation, {
        latitude: row.latitude!,
        longitude: row.longitude!,
      });
      return dist <= radiusMiles;
    });
  }

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name")
    .limit(500);

  const staffById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of staffRows ?? []) {
    const row = s as { user_id: string; email: string | null; full_name: string | null };
    staffById[row.user_id] = row;
  }

  const results: FacilityFinderResult[] = filtered.map((row) => {
    const hasCoords = isValidGeoPoint({
      latitude: row.latitude ?? NaN,
      longitude: row.longitude ?? NaN,
    });
    const distanceMiles =
      agentLocation && hasCoords
        ? haversineDistanceMiles(agentLocation, {
            latitude: row.latitude!,
            longitude: row.longitude!,
          })
        : null;

    const rep = row.assigned_rep_user_id ? staffById[row.assigned_rep_user_id] : null;

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      priority: row.priority,
      city: row.city,
      address: buildFacilityFullAddress(row),
      phone: row.main_phone,
      fax: row.fax,
      lastVisitAt: row.last_visit_at,
      nextFollowUpAt: row.next_follow_up_at,
      assignedRepUserId: row.assigned_rep_user_id,
      assignedRepLabel: rep ? staffPrimaryLabel(rep) : null,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceMiles,
      distanceLabel: formatDistanceMiles(distanceMiles),
      matchExplanation: facilityMatchExplanation(row, parsed),
    };
  });

  if (agentLocation) {
    results.sort((a, b) => {
      if (a.distanceMiles == null && b.distanceMiles == null) return a.name.localeCompare(b.name);
      if (a.distanceMiles == null) return 1;
      if (b.distanceMiles == null) return -1;
      return a.distanceMiles - b.distanceMiles;
    });
  } else {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  const payload: FacilityFinderResponse = {
    results,
    parsedQuery: parsed,
    agentLocation,
    geocodedCount,
    totalMatched: results.length,
  };

  return NextResponse.json(payload);
}
