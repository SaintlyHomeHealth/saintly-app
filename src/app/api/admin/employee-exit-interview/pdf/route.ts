import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

function exitInterviewPdfPath(employeeId: string): string {
  return `exit-interviews/${employeeId}/exit-interview.pdf`;
}

/**
 * On-demand signed redirect for exit interview PDFs (avoids creating signed URLs on every employee detail render).
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffProfile = await getStaffProfile();
  if (!staffProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId")?.trim();
  if (!employeeId) {
    return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("employee_exit_interviews")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("applicant-files")
    .createSignedUrl(exitInterviewPdfPath(employeeId), 60 * 60);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message || "Could not create signed URL" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
