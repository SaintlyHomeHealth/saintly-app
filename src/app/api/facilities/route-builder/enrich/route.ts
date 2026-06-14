import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type RouteBuilderEnrichedFacility = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  type: string | null;
  priority: string | null;
  nextFollowUpAt: string | null;
};

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { facility_ids?: string[] };
  try {
    body = (await req.json()) as { facility_ids?: string[] };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ids = [...new Set((body.facility_ids ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(
    0,
    100
  );

  if (ids.length === 0) {
    return NextResponse.json({ facilities: {} as Record<string, RouteBuilderEnrichedFacility> });
  }

  const { data, error } = await supabaseAdmin
    .from("facilities")
    .select(
      "id, name, type, priority, main_phone, address_line_1, address_line_2, city, state, zip, latitude, longitude, next_follow_up_at"
    )
    .in("id", ids)
    .eq("is_active", true);

  if (error) {
    console.warn("[api/facilities/route-builder/enrich]", error.message);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const facilities: Record<string, RouteBuilderEnrichedFacility> = {};
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      name: string;
      type: string | null;
      priority: string | null;
      main_phone: string | null;
      address_line_1: string | null;
      address_line_2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      latitude: number | null;
      longitude: number | null;
      next_follow_up_at: string | null;
    };
    facilities[r.id] = {
      id: r.id,
      name: r.name,
      address: buildFacilityFullAddress(r),
      phone: r.main_phone,
      latitude: r.latitude,
      longitude: r.longitude,
      type: r.type,
      priority: r.priority,
      nextFollowUpAt: r.next_follow_up_at,
    };
  }

  return NextResponse.json({ facilities });
}
