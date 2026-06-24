import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { CRM_SHARED_MAILBOX_EMAIL } from "@/lib/email-marketing/gmail/constants";
import {
  assertGoogleOAuthReady,
  exchangeGmailOAuthCode,
  fetchConnectedGmailProfile,
} from "@/lib/email-marketing/gmail/oauth";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const STATE_COOKIE = "gmail_oauth_state";
const RETURN_PATH = "/admin/email-marketing?tab=settings";

export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return NextResponse.redirect(`/admin/email-marketing?tab=settings&error=forbidden`);
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${RETURN_PATH}&error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${RETURN_PATH}&error=invalid_oauth_state`);
  }

  try {
    assertGoogleOAuthReady();
    const token = await exchangeGmailOAuthCode(code);
    if (!token.refresh_token) {
      return NextResponse.redirect(`${RETURN_PATH}&error=missing_refresh_token`);
    }
    const profile = await fetchConnectedGmailProfile(token.access_token);

    const { error: upsertError } = await supabaseAdmin.from("email_mailboxes").upsert(
      {
        provider: "gmail",
        email_address: profile.emailAddress || CRM_SHARED_MAILBOX_EMAIL,
        display_name: "Saintly Home Health Admin",
        status: "active",
        oauth_refresh_token: token.refresh_token,
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_address" }
    );
    if (upsertError) {
      return NextResponse.redirect(`${RETURN_PATH}&error=${encodeURIComponent(upsertError.message)}`);
    }

    return NextResponse.redirect(`${RETURN_PATH}&connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(`${RETURN_PATH}&error=${encodeURIComponent(message)}`);
  }
}
