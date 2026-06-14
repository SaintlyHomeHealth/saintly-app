import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { FACILITY_PHOTOS_BUCKET } from "@/lib/crm/facility-photos-constants";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ photoId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { photoId: rawId } = await ctx.params;
  const photoId = (rawId ?? "").trim();
  if (!UUID_RE.test(photoId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin
    .from("facility_activity_photos")
    .select("id, storage_path, original_filename")
    .eq("id", photoId)
    .maybeSingle();

  if (!row?.storage_path) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const path = row.storage_path as string;
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(FACILITY_PHOTOS_BUCKET)
    .createSignedUrl(path, 3600);

  if (signErr || !signed?.signedUrl) {
    console.warn("[facility-photos/file]", signErr?.message);
    return NextResponse.json({ ok: false, error: "signed_url_failed" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
