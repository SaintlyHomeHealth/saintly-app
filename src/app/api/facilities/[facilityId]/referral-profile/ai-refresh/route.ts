import { NextResponse } from "next/server";

import { aiRefreshFacilityReferralProfile } from "@/lib/crm/facility-referral-profile";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

type RouteCtx = { params: Promise<{ facilityId: string }> };

export async function POST(req: Request, context: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { facilityId } = await context.params;
  const { data: facility } = await supabaseAdmin.from("facilities").select("id").eq("id", facilityId).maybeSingle();
  if (!facility?.id) {
    return NextResponse.json({ ok: false, error: "facility_not_found" }, { status: 404 });
  }

  let body: { lookback_days?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // default lookback
  }

  const lookback = Math.min(Math.max(body.lookback_days ?? 180, 30), 365);
  const result = await aiRefreshFacilityReferralProfile(facilityId, lookback);

  if (!result.ok) {
    if (result.error === "ai_not_configured") {
      return NextResponse.json({ ok: false, error: "ai_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    suggested_profile: result.suggested_profile,
    evidence: result.evidence,
    warnings: result.warnings,
  });
}
