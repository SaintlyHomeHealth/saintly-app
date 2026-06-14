import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FACILITY_PHOTOS_BUCKET,
  FACILITY_PHOTO_MAX_BYTES,
  isAllowedFacilityPhotoMime,
} from "@/lib/crm/facility-photos-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeFacilityPhotoFileName(name: string): string {
  const base = typeof name === "string" && name.trim() ? name.trim() : "photo.jpg";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, 180) || "photo.jpg";
}

export type UploadedFacilityPhoto = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  original_filename: string;
};

export async function uploadFacilityPhotos(
  supabase: SupabaseClient,
  input: {
    facility_id: string;
    activity_id?: string | null;
    contact_id?: string | null;
    uploaded_by: string | null;
    files: File[];
  }
): Promise<
  | { ok: true; photos: UploadedFacilityPhoto[] }
  | { ok: false; error: string }
> {
  const facility_id = input.facility_id.trim();
  if (!UUID_RE.test(facility_id)) return { ok: false, error: "invalid_facility_id" };

  const { data: facility } = await supabase.from("facilities").select("id").eq("id", facility_id).maybeSingle();
  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  if (input.activity_id) {
    const { data: act } = await supabase
      .from("facility_activities")
      .select("id")
      .eq("id", input.activity_id)
      .eq("facility_id", facility_id)
      .maybeSingle();
    if (!act?.id) return { ok: false, error: "activity_not_found" };
  }

  if (input.files.length === 0) return { ok: false, error: "missing_files" };

  const uploaded: UploadedFacilityPhoto[] = [];

  for (const file of input.files) {
    if (!(file instanceof File) || file.size <= 0) continue;
    if (file.size > FACILITY_PHOTO_MAX_BYTES) return { ok: false, error: "file_too_large" };

    const mime = (file.type || "image/jpeg").trim().toLowerCase();
    if (!isAllowedFacilityPhotoMime(mime)) return { ok: false, error: "invalid_type" };

    const photoId = crypto.randomUUID();
    const safeName = sanitizeFacilityPhotoFileName(file.name);
    const storage_path = `${facility_id}/${photoId}-${safeName}`;

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > FACILITY_PHOTO_MAX_BYTES) return { ok: false, error: "file_too_large" };

    const { error: upErr } = await supabase.storage.from(FACILITY_PHOTOS_BUCKET).upload(storage_path, buf, {
      contentType: mime,
      upsert: false,
    });

    if (upErr) {
      console.warn("[facility-photos] upload:", upErr.message);
      for (const prev of uploaded) {
        await supabase.storage.from(FACILITY_PHOTOS_BUCKET).remove([prev.storage_path]);
      }
      return { ok: false, error: "upload_failed" };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("facility_activity_photos")
      .insert({
        id: photoId,
        facility_id,
        activity_id: input.activity_id ?? null,
        contact_id: input.contact_id ?? null,
        storage_path,
        original_filename: file.name.trim().slice(0, 500) || safeName,
        mime_type: mime,
        file_size_bytes: file.size,
        uploaded_by: input.uploaded_by,
      })
      .select("id, storage_path, mime_type, file_size_bytes, original_filename")
      .maybeSingle();

    if (insErr || !inserted?.id) {
      await supabase.storage.from(FACILITY_PHOTOS_BUCKET).remove([storage_path]);
      for (const prev of uploaded) {
        await supabase.storage.from(FACILITY_PHOTOS_BUCKET).remove([prev.storage_path]);
        await supabase.from("facility_activity_photos").delete().eq("id", prev.id);
      }
      console.warn("[facility-photos] insert:", insErr?.message);
      return { ok: false, error: "save_failed" };
    }

    uploaded.push({
      id: inserted.id as string,
      storage_path: inserted.storage_path as string,
      mime_type: (inserted.mime_type as string) ?? mime,
      file_size_bytes: Number(inserted.file_size_bytes ?? file.size),
      original_filename: (inserted.original_filename as string) ?? safeName,
    });
  }

  if (uploaded.length === 0) return { ok: false, error: "missing_files" };
  return { ok: true, photos: uploaded };
}

export async function createFacilityPhotoSignedUrl(
  supabase: SupabaseClient,
  storage_path: string,
  ttlSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(FACILITY_PHOTOS_BUCKET)
    .createSignedUrl(storage_path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
