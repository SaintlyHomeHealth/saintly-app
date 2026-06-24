import "server-only";

import {
  CRM_SHARED_MAILBOX_EMAIL,
  GMAIL_SCOPES,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
} from "@/lib/email-marketing/gmail/constants";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export function buildGmailOAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailOAuthCode(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 500) || `Google token exchange failed (${res.status})`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 500) || `Google token refresh failed (${res.status})`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchConnectedGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 500) || `Gmail profile failed (${res.status})`);
  }
  const json = (await res.json()) as { emailAddress?: string };
  const emailAddress = (json.emailAddress ?? "").trim().toLowerCase();
  if (!emailAddress) throw new Error("Gmail profile did not return an email address.");
  if (emailAddress !== CRM_SHARED_MAILBOX_EMAIL) {
    throw new Error(
      `Connected mailbox must be ${CRM_SHARED_MAILBOX_EMAIL}. Got ${emailAddress}. Do not connect info@ or personal Gmail accounts.`
    );
  }
  return { emailAddress };
}

export function assertGoogleOAuthReady(): void {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
}
