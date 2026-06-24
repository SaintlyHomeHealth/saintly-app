import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { assertGoogleOAuthReady, buildGmailOAuthUrl } from "@/lib/email-marketing/gmail/oauth";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    assertGoogleOAuthReady();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google OAuth not configured." },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const googleAuthUrl = buildGmailOAuthUrl(state);
  return NextResponse.redirect(new URL(googleAuthUrl));
}
