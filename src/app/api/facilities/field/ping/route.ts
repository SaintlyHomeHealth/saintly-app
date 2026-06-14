import { NextResponse } from "next/server";

import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
