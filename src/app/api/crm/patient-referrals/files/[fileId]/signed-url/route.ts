import { NextResponse } from "next/server";

import { createPatientReferralSignedUrl } from "@/lib/crm/patient-referral/storage";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const VIEW_FILE_ERROR = "Could not open file. Storage path missing or signed URL failed.";

export async function GET(_req: Request, context: { params: Promise<{ fileId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { fileId } = await context.params;
  const id = fileId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("patient_files")
    .select("id, file_path, file_name, patient_id, referral_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[patient-referral] signed-url lookup:", error.message);
    return NextResponse.json({ error: VIEW_FILE_ERROR }, { status: 500 });
  }

  if (!row?.file_path?.trim()) {
    return NextResponse.json({ error: "File was not saved to storage." }, { status: 404 });
  }

  const signedUrl = await createPatientReferralSignedUrl(row.file_path);
  if (!signedUrl) {
    return NextResponse.json({ error: VIEW_FILE_ERROR }, { status: 404 });
  }

  return NextResponse.json({ ok: true, url: signedUrl });
}
