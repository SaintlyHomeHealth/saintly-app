import { NextResponse } from "next/server";

import { assignReferralIntakeOwner } from "@/lib/crm/facility-referral-intake";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  let body: { intake_owner_id?: string | null };
  try {
    body = (await req.json()) as { intake_owner_id?: string | null };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await assignReferralIntakeOwner(staff, leadId, body.intake_owner_id ?? null);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
