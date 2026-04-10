import { NextResponse } from "next/server";

import { RECRUITING_RESUMES_BUCKET } from "@/lib/recruiting/recruiting-resume-storage";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  props: { params: Promise<{ candidateId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { candidateId } = await props.params;
  const id = typeof candidateId === "string" ? candidateId.trim() : "";
  if (!UUID_RE.test(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "download" ? "download" : "view";

  const { data: row, error } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("resume_storage_path, resume_file_name")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const path =
    typeof row.resume_storage_path === "string" && row.resume_storage_path.trim()
      ? row.resume_storage_path.trim()
      : null;
  if (!path) {
    return new NextResponse("No resume", { status: 404 });
  }

  const downloadName =
    typeof row.resume_file_name === "string" && row.resume_file_name.trim()
      ? row.resume_file_name.trim()
      : "resume";

  const bucket = supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET);
  const { data: signed, error: signErr } =
    mode === "download"
      ? await bucket.createSignedUrl(path, 60 * 60, { download: downloadName })
      : await bucket.createSignedUrl(path, 60 * 60);

  if (signErr || !signed?.signedUrl) {
    console.warn("[recruiting] resume signed URL:", signErr?.message);
    return new NextResponse("Unavailable", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
