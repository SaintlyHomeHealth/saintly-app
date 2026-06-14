import { NextResponse } from "next/server";

import { loadCampaignAnalytics } from "@/lib/crm/facility-campaigns";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rep_id = url.searchParams.get("rep_id");

  try {
    const analytics = await loadCampaignAnalytics(staff, { rep_id });
    return NextResponse.json({ ok: true, analytics });
  } catch (e) {
    console.warn("[campaigns/analytics]:", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
