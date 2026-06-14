import { NextResponse } from "next/server";

import {
  buildFacilityReferralProfileSummary,
  ensureFacilityReferralProfile,
  loadFacilityReferralProfile,
  updateFacilityReferralProfile,
} from "@/lib/crm/facility-referral-profile";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

type RouteCtx = { params: Promise<{ facilityId: string }> };

async function assertFacilityAccess(facilityId: string) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return { staff: null, error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const { data: facility } = await supabaseAdmin.from("facilities").select("id").eq("id", facilityId).maybeSingle();
  if (!facility?.id) {
    return { staff: null, error: NextResponse.json({ ok: false, error: "facility_not_found" }, { status: 404 }) };
  }
  return { staff, error: null };
}

export async function GET(_req: Request, context: RouteCtx) {
  const { facilityId } = await context.params;
  const gate = await assertFacilityAccess(facilityId);
  if (gate.error) return gate.error;

  try {
    const summary = await loadFacilityReferralProfile(facilityId);
    return NextResponse.json({ ok: true, summary });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteCtx) {
  const { facilityId } = await context.params;
  const gate = await assertFacilityAccess(facilityId);
  if (gate.error || !gate.staff) return gate.error!;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    await ensureFacilityReferralProfile(facilityId);
    await updateFacilityReferralProfile(facilityId, body, gate.staff.user_id);
    const summary = await buildFacilityReferralProfileSummary(facilityId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.warn("[referral-profile] patch:", e);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
