import { NextResponse } from "next/server";

import { createCampaign, listCampaigns } from "@/lib/crm/facility-campaigns";
import type { CreateCampaignInput } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type CampaignsListResponse =
  | { ok: true; campaigns: Awaited<ReturnType<typeof listCampaigns>> }
  | { ok: false; error: string };

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies CampaignsListResponse, { status: 403 });
  }

  try {
    const campaigns = await listCampaigns(staff);
    return NextResponse.json({ ok: true, campaigns } satisfies CampaignsListResponse);
  } catch (e) {
    console.warn("[campaigns] GET:", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies CampaignsListResponse, { status: 500 });
  }
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreateCampaignInput;
  try {
    body = (await req.json()) as CreateCampaignInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createCampaign(staff, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
