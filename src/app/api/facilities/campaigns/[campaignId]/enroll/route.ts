import { NextResponse } from "next/server";

import { enrollFacilitiesInCampaign } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { campaignId } = await context.params;
  let body: { facility_ids?: string[] };
  try {
    body = (await req.json()) as { facility_ids?: string[] };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const facilityIds = (body.facility_ids ?? []).filter(Boolean);
  if (facilityIds.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_facilities" }, { status: 400 });
  }

  const result = await enrollFacilitiesInCampaign(staff, campaignId, facilityIds, {
    skip_existing: true,
  });
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
