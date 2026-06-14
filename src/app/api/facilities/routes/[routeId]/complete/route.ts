import { NextResponse } from "next/server";

import { completeRoutePlan } from "@/lib/crm/facility-route-plans";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ routeId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId } = await context.params;
  const result = await completeRoutePlan(staff, routeId);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
