import { NextResponse } from "next/server";

import { attachReferralSource } from "@/lib/crm/facility-referral-source-review";
import { getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { leadId } = await context.params;
  let body: {
    facility_id?: string;
    contact_id?: string | null;
    create_contact?: boolean;
    note?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.facility_id) {
    return NextResponse.json({ ok: false, error: "facility_id_required" }, { status: 400 });
  }

  const result = await attachReferralSource(staff, leadId, {
    facility_id: body.facility_id,
    contact_id: body.contact_id,
    create_contact: body.create_contact,
    note: body.note,
  });

  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
