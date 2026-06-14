import { NextResponse } from "next/server";

import {
  createPacketMaterial,
  uploadPacketMaterialFile,
} from "@/lib/crm/facility-packet-materials";
import type { PacketType } from "@/lib/crm/facility-packet-types";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const formData = (await req.formData()) as globalThis.FormData;
  const fileValue = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const packetTypeRaw = String(formData.get("packet_type") ?? "").trim();
  const packet_type = (packetTypeRaw || null) as PacketType | null;
  const externalUrl = String(formData.get("external_url") ?? "").trim() || null;
  const materialId = String(formData.get("material_id") ?? "").trim();

  if (materialId) {
    if (!(fileValue instanceof File) || fileValue.size <= 0) {
      return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
    }
    const upload = await uploadPacketMaterialFile(staff, materialId, fileValue);
    if (!upload.ok) return NextResponse.json(upload, { status: 400 });
    return NextResponse.json({ ok: true, storage_path: upload.storage_path });
  }

  if (!name) {
    return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
  }

  const created = await createPacketMaterial(staff, {
    name,
    description,
    packet_type,
    external_url: externalUrl,
  });
  if (!created.ok) return NextResponse.json(created, { status: 400 });

  if (fileValue instanceof File && fileValue.size > 0) {
    const upload = await uploadPacketMaterialFile(staff, created.material.id, fileValue);
    if (!upload.ok) {
      return NextResponse.json({ ok: true, material: created.material, upload_error: upload.error });
    }
    return NextResponse.json({
      ok: true,
      material: { ...created.material, storage_path: upload.storage_path },
    });
  }

  return NextResponse.json({ ok: true, material: created.material });
}
