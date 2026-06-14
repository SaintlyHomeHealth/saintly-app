import { NextResponse } from "next/server";

import { listSourceLinkEvents } from "@/lib/crm/facility-referral-source-links-admin";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ linkId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { linkId } = await ctx.params;
  const events = await listSourceLinkEvents(staff, linkId);
  return NextResponse.json({ ok: true, events });
}
