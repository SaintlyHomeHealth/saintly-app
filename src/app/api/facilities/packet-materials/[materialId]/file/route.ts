import { NextResponse } from "next/server";

import { getPacketMaterialById, signedPacketMaterialUrl } from "@/lib/crm/facility-packet-materials";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ materialId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { materialId } = await context.params;
  const material = await getPacketMaterialById(materialId);
  if (!material || !material.is_active) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (material.external_url && !material.storage_path) {
    return NextResponse.redirect(material.external_url);
  }

  if (!material.storage_path) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 404 });
  }

  const url = await signedPacketMaterialUrl(material.storage_path);
  if (!url) {
    return NextResponse.json({ ok: false, error: "signed_url_failed" }, { status: 500 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  if (download) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json({
    ok: true,
    url,
    file_name: material.file_name,
    mime_type: material.mime_type,
  });
}
