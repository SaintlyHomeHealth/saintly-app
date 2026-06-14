import { NextResponse } from "next/server";

import { getPacketDeliveryConfig } from "@/lib/crm/facility-packet-delivery";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const config = await getPacketDeliveryConfig();
  return NextResponse.json({ ok: true, ...config });
}
