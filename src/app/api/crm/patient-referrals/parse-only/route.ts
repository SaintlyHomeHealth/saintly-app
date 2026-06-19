import { NextResponse } from "next/server";

import { parsePatientReferralDocumentFromFormData } from "@/lib/crm/patient-referral/parse-document";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = (await req.formData().catch(() => null)) as globalThis.FormData | null;
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const result = await parsePatientReferralDocumentFromFormData(formData);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    file_name: result.file_name,
    referral_source_type: result.referral_source_type,
    parse: result.parse,
  });
}
