import { NextResponse } from "next/server";

import { listPacketMaterials } from "@/lib/crm/facility-packet-requests";
import { createPacketMaterial, listAllPacketMaterials } from "@/lib/crm/facility-packet-materials";
import type { PacketType } from "@/lib/crm/facility-packet-types";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const all = new URL(req.url).searchParams.get("all") === "1";
  const materials = all && canAccessFacilityAdminTools(staff)
    ? await listAllPacketMaterials(staff)
    : await listPacketMaterials(staff);
  return NextResponse.json({ ok: true, materials });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { name?: string; description?: string | null; packet_type?: PacketType | null; external_url?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createPacketMaterial(staff, {
    name: body.name ?? "",
    description: body.description,
    packet_type: body.packet_type,
    external_url: body.external_url,
  });

  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, id: result.material.id, material: result.material });
}
