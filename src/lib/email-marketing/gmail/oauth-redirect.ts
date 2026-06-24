import { NextRequest, NextResponse } from "next/server";

const SETTINGS_PATH = "/admin/email-marketing";

/** Absolute redirect back to Email & Marketing → Settings (required by Next.js middleware). */
export function redirectToEmailMarketingSettings(
  request: NextRequest,
  params?: { connected?: boolean; error?: string }
): NextResponse {
  const redirectUrl = new URL(SETTINGS_PATH, request.url);
  redirectUrl.searchParams.set("tab", "settings");
  if (params?.connected) {
    redirectUrl.searchParams.set("connected", "1");
  }
  if (params?.error) {
    redirectUrl.searchParams.set("error", params.error);
  }
  return NextResponse.redirect(redirectUrl);
}
