import { NextResponse } from "next/server";

import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

type RouteCtx = { params: Promise<{ facilityId: string }> };

export async function PATCH(req: Request, context: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { facilityId } = await context.params;
  let body: {
    contact_id: string;
    is_best_contact?: boolean;
    is_decision_maker?: boolean;
    is_gatekeeper?: boolean;
    is_referral_contact?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { data: contact } = await supabaseAdmin
    .from("facility_contacts")
    .select("id, facility_id")
    .eq("id", body.contact_id)
    .eq("facility_id", facilityId)
    .maybeSingle();

  if (!contact?.id) {
    return NextResponse.json({ ok: false, error: "contact_not_found" }, { status: 404 });
  }

  const patch: Record<string, boolean> = {};
  if (body.is_best_contact !== undefined) patch.is_best_contact = body.is_best_contact;
  if (body.is_decision_maker !== undefined) patch.is_decision_maker = body.is_decision_maker;
  if (body.is_gatekeeper !== undefined) patch.is_gatekeeper = body.is_gatekeeper;
  if (body.is_referral_contact !== undefined) patch.is_referral_contact = body.is_referral_contact;

  if (body.is_best_contact) {
    await supabaseAdmin
      .from("facility_contacts")
      .update({ is_best_contact: false })
      .eq("facility_id", facilityId)
      .neq("id", body.contact_id);
    await supabaseAdmin
      .from("facility_referral_profiles")
      .upsert({ facility_id: facilityId, best_contact_id: body.contact_id }, { onConflict: "facility_id" });
  }

  const { error } = await supabaseAdmin.from("facility_contacts").update(patch).eq("id", body.contact_id);
  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
