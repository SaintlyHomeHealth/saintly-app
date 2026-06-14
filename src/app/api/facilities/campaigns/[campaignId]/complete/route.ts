import { NextResponse } from "next/server";

import { completeCampaign } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { campaignId } = await context.params;
  const result = await completeCampaign(staff, campaignId);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
