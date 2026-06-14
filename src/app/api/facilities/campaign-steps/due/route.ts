import { NextResponse } from "next/server";

import { listDueCampaignStepsForUser } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const steps = await listDueCampaignStepsForUser(staff);
    return NextResponse.json({ ok: true, steps });
  } catch (e) {
    console.warn("[campaign-steps/due]:", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
