import { NextResponse } from "next/server";

import { getActiveRouteForToday } from "@/lib/crm/facility-route-plans";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const route = await getActiveRouteForToday(staff);
  return NextResponse.json({ ok: true, route });
}
