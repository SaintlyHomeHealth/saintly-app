import { NextResponse } from "next/server";

import { buildFacilityReferralProfileSummary, createFollowUpFromProfileAction } from "@/lib/crm/facility-referral-profile";
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

  let body: { title?: string; due_at?: string | null; contact_id?: string | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // optional body
  }

  const result = await createFollowUpFromProfileAction(facilityId, staff, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "task_failed" }, { status: 400 });
  }

  const summary = await buildFacilityReferralProfileSummary(facilityId);
  return NextResponse.json({ ok: true, task_id: result.task_id, summary });
}
