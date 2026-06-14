import { NextResponse } from "next/server";

import { archivePacketMaterial } from "@/lib/crm/facility-packet-materials";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ materialId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { materialId } = await context.params;
  const result = await archivePacketMaterial(staff, materialId);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true });
}
