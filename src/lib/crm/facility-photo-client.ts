import { FACILITY_PHOTO_MAX_BYTES, FACILITY_PHOTO_MAX_FILES } from "@/lib/crm/facility-photos-constants";

export type UploadedPhotoMeta = {
  id: string;
  storage_path: string;
  url: string | null;
  mime_type: string;
  file_size_bytes: number;
  original_filename: string;
};

export async function uploadFacilityPhotoFiles(input: {
  facilityId: string;
  activityId?: string | null;
  contactId?: string | null;
  files: File[];
}): Promise<{ ok: true; photos: UploadedPhotoMeta[] } | { ok: false; error: string }> {
  if (input.files.length === 0) return { ok: false, error: "missing_files" };
  if (input.files.length > FACILITY_PHOTO_MAX_FILES) return { ok: false, error: "too_many_files" };

  const form = new FormData();
  form.set("facility_id", input.facilityId);
  if (input.activityId) form.set("activity_id", input.activityId);
  if (input.contactId) form.set("contact_id", input.contactId);
  for (const file of input.files) {
    form.append("files[]", file);
  }

  const res = await fetch("/api/facilities/photos/upload", { method: "POST", body: form });
  const data = (await res.json()) as { ok: boolean; error?: string; photos?: UploadedPhotoMeta[] };
  if (!data.ok || !data.photos?.length) {
    return { ok: false, error: data.error ?? "upload_failed" };
  }
  return { ok: true, photos: data.photos };
}

export function validatePhotoFiles(files: File[]): string | null {
  if (files.length === 0) return null;
  if (files.length > FACILITY_PHOTO_MAX_FILES) return `Maximum ${FACILITY_PHOTO_MAX_FILES} photos at a time.`;
  for (const f of files) {
    if (f.size > FACILITY_PHOTO_MAX_BYTES) return "One or more photos exceed the 10 MB limit.";
    if (!f.type.startsWith("image/")) return "Only image files are supported.";
  }
  return null;
}

export function facilityPhotoFileUrl(photoId: string): string {
  return `/api/facilities/photos/${photoId}/file`;
}
