import { NextResponse } from "next/server";

import { checkInRouteStop } from "@/lib/crm/facility-route-plans";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ routeId: string; stopId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId, stopId } = await context.params;
  let body: { latitude?: number | null; longitude?: number | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await checkInRouteStop(staff, routeId, stopId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
