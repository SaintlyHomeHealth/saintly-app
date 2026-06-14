import { NextResponse } from "next/server";

import { skipCampaignStepInstance } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ stepInstanceId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { stepInstanceId } = await context.params;
  let body: { notes?: string | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const result = await skipCampaignStepInstance(staff, stepInstanceId, body);
  if (!result.ok) {
    const status = result.error === "step_not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
