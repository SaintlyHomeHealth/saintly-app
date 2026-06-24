import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { CRM_SHARED_MAILBOX_EMAIL } from "@/lib/email-marketing/gmail/constants";
import { redirectToEmailMarketingSettings } from "@/lib/email-marketing/gmail/oauth-redirect";
import {
  assertGoogleOAuthReady,
  exchangeGmailOAuthCode,
  fetchConnectedGmailProfile,
} from "@/lib/email-marketing/gmail/oauth";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return redirectToEmailMarketingSettings(request, { error: "forbidden" });
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return redirectToEmailMarketingSettings(request, { error: oauthError });
  }

  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToEmailMarketingSettings(request, { error: "invalid_oauth_state" });
  }

  try {
    assertGoogleOAuthReady();
    const token = await exchangeGmailOAuthCode(code);
    if (!token.refresh_token) {
      return redirectToEmailMarketingSettings(request, { error: "missing_refresh_token" });
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
      return redirectToEmailMarketingSettings(request, { error: upsertError.message });
    }

    return redirectToEmailMarketingSettings(request, { connected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return redirectToEmailMarketingSettings(request, { error: message });
  }
}
