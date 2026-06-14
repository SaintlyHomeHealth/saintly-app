import { NextResponse } from "next/server";

import { skipRouteStop } from "@/lib/crm/facility-route-plans";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ routeId: string; stopId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId, stopId } = await context.params;
  let body: { skip_reason?: string; notes?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.skip_reason?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_reason" }, { status: 400 });
  }

  const result = await skipRouteStop(staff, routeId, stopId, {
    skip_reason: body.skip_reason,
    notes: body.notes,
  });
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
