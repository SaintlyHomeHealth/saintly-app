import { NextResponse } from "next/server";

import { listFacilitySegments, saveFacilitySegment } from "@/lib/crm/facility-campaign-enrollment";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const segments = await listFacilitySegments(staff);
  return NextResponse.json({ ok: true, segments });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { name?: string; description?: string | null; filters_json?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await saveFacilitySegment(staff, {
    name: body.name ?? "",
    description: body.description,
    filters_json: body.filters_json ?? {},
  });

  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
