import { NextResponse } from "next/server";

import { applyAiSuggestedProfile, buildFacilityReferralProfileSummary } from "@/lib/crm/facility-referral-profile";
import type { FacilityReferralProfileAiSuggestion } from "@/lib/crm/facility-referral-profile-types";
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

  let body: {
    fields?: Partial<FacilityReferralProfileAiSuggestion>;
    ai_summary?: string | null;
    confidence?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.fields || Object.keys(body.fields).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  try {
    await applyAiSuggestedProfile(
      facilityId,
      body.fields,
      staff.user_id,
      body.ai_summary,
      body.confidence
    );
    const summary = await buildFacilityReferralProfileSummary(facilityId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.warn("[referral-profile] apply-ai:", e);
    return NextResponse.json({ ok: false, error: "apply_failed" }, { status: 500 });
  }
}
