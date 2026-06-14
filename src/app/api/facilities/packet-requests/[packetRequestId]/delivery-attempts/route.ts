import { NextResponse } from "next/server";

import { listPacketDeliveryAttempts } from "@/lib/crm/facility-packet-delivery";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ packetRequestId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { packetRequestId } = await context.params;
  const attempts = await listPacketDeliveryAttempts(staff, packetRequestId);
  return NextResponse.json({ ok: true, attempts });
}
