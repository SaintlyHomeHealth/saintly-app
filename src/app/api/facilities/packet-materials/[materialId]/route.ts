import { NextResponse } from "next/server";

import { updatePacketMaterial } from "@/lib/crm/facility-packet-materials";
import type { PacketType } from "@/lib/crm/facility-packet-types";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ materialId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { materialId } = await context.params;
  let body: {
    name?: string;
    description?: string | null;
    packet_type?: PacketType | null;
    external_url?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updatePacketMaterial(staff, materialId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, material: result.material });
}
