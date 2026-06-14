import { NextResponse } from "next/server";

import { markPacketRequestSent } from "@/lib/crm/facility-packet-requests";
import type { PacketDeliveryMethod } from "@/lib/crm/facility-packet-types";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ packetRequestId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { packetRequestId } = await context.params;
  let body: {
    sent_method?: PacketDeliveryMethod | null;
    sent_at?: string | null;
    sent_notes?: string | null;
    create_follow_up?: boolean;
    follow_up_due_at?: string | null;
    create_referral_link?: boolean;
    material_ids?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await markPacketRequestSent(staff, packetRequestId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
