import { NextResponse } from "next/server";

import { createPatientReferralSignedUrl } from "@/lib/crm/patient-referral/storage";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

function isSafeStoragePath(path: string): boolean {
  const p = path.trim();
  if (!p || p.startsWith("/") || p.includes("..")) return false;
  return /^[a-zA-Z0-9_\-./]+$/.test(p);
}

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path")?.trim() ?? "";
  if (!isSafeStoragePath(path)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const signedUrl = await createPatientReferralSignedUrl(path, 3600);
  if (!signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, url: signedUrl });
}
