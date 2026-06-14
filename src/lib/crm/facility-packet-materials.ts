import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import type { PacketMaterialRow, PacketType } from "@/lib/crm/facility-packet-types";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export const FACILITY_PACKET_MATERIALS_BUCKET = "facility-packet-materials";
export const MAX_PACKET_MATERIAL_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function mapMaterialRow(raw: Record<string, unknown>): PacketMaterialRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: typeof raw.description === "string" ? raw.description : null,
    packet_type: (raw.packet_type as PacketType | null) ?? null,
    storage_path: typeof raw.storage_path === "string" ? raw.storage_path : null,
    external_url: typeof raw.external_url === "string" ? raw.external_url : null,
    file_name: typeof raw.file_name === "string" ? raw.file_name : null,
    mime_type: typeof raw.mime_type === "string" ? raw.mime_type : null,
    file_size_bytes: typeof raw.file_size_bytes === "number" ? raw.file_size_bytes : null,
    is_active: raw.is_active !== false,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export async function listActivePacketMaterials(staff: StaffProfile): Promise<PacketMaterialRow[]> {
  if (!canAccessFacilityFieldTools(staff)) return [];
  const { data } = await supabaseAdmin
    .from("facility_packet_materials")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>));
}

export async function listAllPacketMaterials(staff: StaffProfile): Promise<PacketMaterialRow[]> {
  if (!canAccessFacilityAdminTools(staff)) return listActivePacketMaterials(staff);
  const { data } = await supabaseAdmin.from("facility_packet_materials").select("*").order("name");
  return (data ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>));
}

export async function loadPacketMaterialsByIds(ids: string[]): Promise<PacketMaterialRow[]> {
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from("facility_packet_materials").select("*").in("id", ids);
  return (data ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>));
}

export async function getPacketMaterialById(materialId: string): Promise<PacketMaterialRow | null> {
  const { data } = await supabaseAdmin
    .from("facility_packet_materials")
    .select("*")
    .eq("id", materialId)
    .maybeSingle();
  return data ? mapMaterialRow(data as Record<string, unknown>) : null;
}

export function validateMaterialUpload(file: { size: number; type: string; name: string }): string | null {
  if (file.size <= 0) return "File is empty.";
  if (file.size > MAX_PACKET_MATERIAL_BYTES) return "File exceeds 10 MB limit.";
  const mime = file.type || guessMimeFromName(file.name);
  if (!ALLOWED_MIME.has(mime)) return "File type not allowed. Use PDF, PNG, JPG, or DOCX.";
  return null;
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function uploadPacketMaterialFile(
  staff: StaffProfile,
  materialId: string,
  file: { name: string; type: string; arrayBuffer: () => Promise<ArrayBuffer>; size: number }
): Promise<{ ok: true; storage_path: string } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const validation = validateMaterialUpload({ size: file.size, type: file.type, name: file.name });
  if (validation) return { ok: false, error: validation };

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "pdf";
  const storagePath = `${materialId}/${Date.now()}-${sanitizeFileName(file.name) || `packet.${ext}`}`;
  const mime = file.type || guessMimeFromName(file.name);
  const bytes = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage.from(FACILITY_PACKET_MATERIALS_BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) return { ok: false, error: "upload_failed" };

  const { error: updateErr } = await supabaseAdmin
    .from("facility_packet_materials")
    .update({
      storage_path: storagePath,
      file_name: file.name,
      mime_type: mime,
      file_size_bytes: file.size,
    })
    .eq("id", materialId);

  if (updateErr) return { ok: false, error: "update_failed" };
  return { ok: true, storage_path: storagePath };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function signedPacketMaterialUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(FACILITY_PACKET_MATERIALS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadPacketMaterialBytes(
  storagePath: string
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string } | null> {
  const { data, error } = await supabaseAdmin.storage.from(FACILITY_PACKET_MATERIALS_BUCKET).download(storagePath);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const fileName = storagePath.split("/").pop() ?? "packet.pdf";
  return { bytes, mimeType: data.type || guessMimeFromName(fileName), fileName };
}

export async function createPacketMaterial(
  staff: StaffProfile,
  input: {
    name: string;
    description?: string | null;
    packet_type?: PacketType | null;
    external_url?: string | null;
  }
): Promise<{ ok: true; material: PacketMaterialRow } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "missing_name" };

  const { data, error } = await supabaseAdmin
    .from("facility_packet_materials")
    .insert({
      name,
      description: (input.description ?? "").trim() || null,
      packet_type: input.packet_type ?? null,
      external_url: (input.external_url ?? "").trim() || null,
      created_by: staff.user_id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "save_failed" };
  return { ok: true, material: mapMaterialRow(data as Record<string, unknown>) };
}

export async function updatePacketMaterial(
  staff: StaffProfile,
  materialId: string,
  input: {
    name?: string;
    description?: string | null;
    packet_type?: PacketType | null;
    external_url?: string | null;
  }
): Promise<{ ok: true; material: PacketMaterialRow } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "missing_name" };
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = (input.description ?? "").trim() || null;
  if (input.packet_type !== undefined) patch.packet_type = input.packet_type;
  if (input.external_url !== undefined) patch.external_url = (input.external_url ?? "").trim() || null;

  const { data, error } = await supabaseAdmin
    .from("facility_packet_materials")
    .update(patch)
    .eq("id", materialId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "update_failed" };
  return { ok: true, material: mapMaterialRow(data as Record<string, unknown>) };
}

export async function archivePacketMaterial(
  staff: StaffProfile,
  materialId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const { error } = await supabaseAdmin
    .from("facility_packet_materials")
    .update({ is_active: false })
    .eq("id", materialId);
  return error ? { ok: false, error: "archive_failed" } : { ok: true };
}

export function suggestMaterialsForPacketType(
  materials: PacketMaterialRow[],
  packetType: PacketType | null | undefined
): PacketMaterialRow[] {
  if (!packetType) return materials.filter((m) => m.packet_type === "general_agency_packet");
  const exact = materials.filter((m) => m.packet_type === packetType);
  if (exact.length) return exact;
  return materials;
}
