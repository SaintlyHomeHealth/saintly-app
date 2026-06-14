import { NextResponse } from "next/server";

import { getOrCreatePacketReferralSourceLink } from "@/lib/crm/facility-referral-source-links";
import { loadPacketRequestForStaff } from "@/lib/crm/facility-packet-delivery-access";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ packetRequestId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { packetRequestId } = await context.params;
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: { material_ids?: string[]; delivery_method?: string | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await getOrCreatePacketReferralSourceLink(packetRequestId, {
    material_ids: body.material_ids,
    delivery_method: body.delivery_method ?? loaded.row.delivery_method,
    created_by: staff.user_id,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    link: {
      id: result.link.id,
      label: result.link.label,
      token_segment: result.token_segment,
      public_path: result.public_path,
      public_url: result.public_url,
    },
  });
}
