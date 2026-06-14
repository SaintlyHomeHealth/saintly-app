import { NextResponse } from "next/server";

import {
  listCampaignCandidateFacilities,
  parseCandidateFiltersFromSearchParams,
} from "@/lib/crm/facility-campaign-enrollment";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { campaignId } = await context.params;
  const url = new URL(req.url);
  const filters = parseCandidateFiltersFromSearchParams(url.searchParams);
  const result = await listCampaignCandidateFacilities(staff, campaignId, filters);

  return NextResponse.json({ ok: true, ...result });
}
