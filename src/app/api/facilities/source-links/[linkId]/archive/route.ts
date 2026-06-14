import { NextResponse } from "next/server";

import { archiveSourceLink } from "@/lib/crm/facility-referral-source-links-admin";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ linkId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { linkId } = await ctx.params;
  const result = await archiveSourceLink(staff, linkId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
