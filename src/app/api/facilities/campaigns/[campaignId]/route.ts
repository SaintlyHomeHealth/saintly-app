import { NextResponse } from "next/server";

import {
  completeCampaign,
  getCampaignDetail,
  pauseCampaign,
  updateCampaign,
} from "@/lib/crm/facility-campaigns";
import type { CreateCampaignInput } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { campaignId } = await context.params;
  const campaign = await getCampaignDetail(staff, campaignId);
  if (!campaign) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign });
}

export async function PATCH(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { campaignId } = await context.params;
  let body: Partial<CreateCampaignInput>;
  try {
    body = (await req.json()) as Partial<CreateCampaignInput>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateCampaign(staff, campaignId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
