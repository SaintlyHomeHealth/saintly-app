import { NextRequest, NextResponse } from "next/server";

import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

const COOKIE = "onboarding_admin_preview_applicant";
const MAX_AGE = 60 * 60 * 4;

/**
 * Admins only: set a secure cookie with the target applicant id, then open the public onboarding
 * shell so the browser can load the same localStorage flow as a candidate (read-only in UI).
 */
export async function GET(request: NextRequest) {
  const profile = await getStaffProfile();
  if (!isAdminOrHigher(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("applicantId")?.trim();
  if (!id) {
    return NextResponse.json({ error: "applicantId is required" }, { status: 400 });
  }

  const target = new URL("/onboarding-welcome?obPreview=1", request.nextUrl.origin);
  const res = NextResponse.redirect(target, 303);
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
