import { NextResponse } from "next/server";

import { listEnrollmentsForFacility } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const facilityId = new URL(req.url).searchParams.get("facility_id") ?? "";
  const enrollments = await listEnrollmentsForFacility(facilityId);
  return NextResponse.json({ ok: true, enrollments });
}
