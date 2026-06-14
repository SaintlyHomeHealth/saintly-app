import { NextResponse } from "next/server";

import { updateReferralChecklist } from "@/lib/crm/facility-referral-intake";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  let body: Record<string, boolean>;
  try {
    body = (await req.json()) as Record<string, boolean>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  const keys = [
    "patient_contacted",
    "insurance_verified",
    "service_need_confirmed",
    "orders_requested",
    "f2f_requested",
    "packet_received",
    "soc_availability_checked",
    "clinician_scheduling_started",
    "referral_source_updated",
    "converted_or_closed",
  ] as const;

  for (const k of keys) {
    if (typeof body[k] === "boolean") patch[k] = body[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const result = await updateReferralChecklist(staff, leadId, patch);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "lead_not_found" ? 404 : 400 });
  }

  return NextResponse.json({ ok: true, checklist: result.checklist });
}
