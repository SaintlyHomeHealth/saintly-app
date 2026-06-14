import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  FACILITY_PHOTO_MAX_FILES,
  isAllowedFacilityPhotoMime,
  FACILITY_PHOTO_MAX_BYTES,
} from "@/lib/crm/facility-photos-constants";
import { createFacilityPhotoSignedUrl, uploadFacilityPhotos } from "@/lib/crm/facility-photo-upload";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityPhotoUploadItem = {
  id: string;
  storage_path: string;
  url: string | null;
  mime_type: string;
  file_size_bytes: number;
  original_filename: string;
};

export type FacilityPhotoUploadResponse =
  | { ok: true; photos: FacilityPhotoUploadItem[] }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityPhotoUploadResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();

  let formData: globalThis.FormData;
  try {
    formData = (await req.formData()) as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" } satisfies FacilityPhotoUploadResponse, {
      status: 400,
    });
  }

  const facilityIdRaw = formData.get("facility_id");
  const facility_id = typeof facilityIdRaw === "string" ? facilityIdRaw.trim() : "";
  if (!UUID_RE.test(facility_id)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies FacilityPhotoUploadResponse, {
      status: 400,
    });
  }

  const activityIdRaw = formData.get("activity_id");
  const activity_id =
    typeof activityIdRaw === "string" && UUID_RE.test(activityIdRaw.trim()) ? activityIdRaw.trim() : null;

  const contactIdRaw = formData.get("contact_id");
  const contact_id =
    typeof contactIdRaw === "string" && UUID_RE.test(contactIdRaw.trim()) ? contactIdRaw.trim() : null;

  const files: File[] = [];
  const fromArray = formData.getAll("files[]");
  for (const entry of fromArray) {
    if (entry instanceof File && entry.size > 0) files.push(entry);
  }
  if (files.length === 0) {
    const single = formData.get("file");
    if (single instanceof File && single.size > 0) files.push(single);
  }

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_files" } satisfies FacilityPhotoUploadResponse, {
      status: 400,
    });
  }

  if (files.length > FACILITY_PHOTO_MAX_FILES) {
    return NextResponse.json({ ok: false, error: "too_many_files" } satisfies FacilityPhotoUploadResponse, {
      status: 400,
    });
  }

  for (const file of files) {
    const mime = (file.type || "").trim().toLowerCase();
    if (!isAllowedFacilityPhotoMime(mime)) {
      return NextResponse.json({ ok: false, error: "invalid_type" } satisfies FacilityPhotoUploadResponse, {
        status: 400,
      });
    }
    if (file.size > FACILITY_PHOTO_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large" } satisfies FacilityPhotoUploadResponse, {
        status: 400,
      });
    }
  }

  const result = await uploadFacilityPhotos(supabaseAdmin, {
    facility_id,
    activity_id,
    contact_id,
    uploaded_by: user?.id ?? null,
    files,
  });

  if (!result.ok) {
    const status =
      result.error === "facility_not_found" || result.error === "activity_not_found"
        ? 404
        : result.error === "file_too_large" || result.error === "invalid_type"
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: result.error } satisfies FacilityPhotoUploadResponse, { status });
  }

  const photos: FacilityPhotoUploadItem[] = [];
  for (const p of result.photos) {
    const url = await createFacilityPhotoSignedUrl(supabaseAdmin, p.storage_path, 3600);
    photos.push({
      id: p.id,
      storage_path: p.storage_path,
      url,
      mime_type: p.mime_type,
      file_size_bytes: p.file_size_bytes,
      original_filename: p.original_filename,
    });
  }

  return NextResponse.json({ ok: true, photos } satisfies FacilityPhotoUploadResponse);
}
