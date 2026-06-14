import { NextResponse } from "next/server";

import { cancelPacketRequest } from "@/lib/crm/facility-packet-requests";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ packetRequestId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { packetRequestId } = await context.params;
  let body: { reason?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await cancelPacketRequest(staff, packetRequestId, body.reason);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
