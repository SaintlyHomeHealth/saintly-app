import { NextResponse } from "next/server";

import { quickAddFacilityFromPlace } from "@/lib/crm/facility-quick-add-from-place";
import { linkRouteStopToFacility } from "@/lib/crm/facility-route-plans";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ routeId: string; stopId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId, stopId } = await context.params;
  let body: {
    name?: string;
    address_line_1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    main_phone?: string | null;
    website?: string | null;
    type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    google_place_id?: string | null;
    notes?: string | null;
    create_anyway?: boolean;
    use_existing_facility_id?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.use_existing_facility_id) {
    const link = await linkRouteStopToFacility(staff, routeId, stopId, body.use_existing_facility_id, body.name);
    if (!link.ok) return NextResponse.json(link, { status: 400 });
    return NextResponse.json({ ok: true, facility_id: body.use_existing_facility_id });
  }

  const quickAdd = await quickAddFacilityFromPlace(staff, {
    name: body.name ?? "",
    address_line_1: body.address_line_1,
    city: body.city,
    state: body.state,
    zip: body.zip,
    main_phone: body.main_phone,
    website: body.website,
    type: body.type,
    latitude: body.latitude,
    longitude: body.longitude,
    google_place_id: body.google_place_id,
    notes: body.notes,
    create_anyway: body.create_anyway,
  });

  if (!quickAdd.ok) return NextResponse.json(quickAdd, { status: 400 });

  const link = await linkRouteStopToFacility(staff, routeId, stopId, quickAdd.facility_id, quickAdd.name);
  if (!link.ok) return NextResponse.json(link, { status: 400 });

  return NextResponse.json({ ok: true, facility_id: quickAdd.facility_id, name: quickAdd.name });
}
