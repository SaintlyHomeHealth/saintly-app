import "server-only";

import { getStaffSignInPageUrl } from "@/lib/auth/staff-sign-in-url";
import { isOnboardingEmailConfigured, ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR } from "@/lib/email/send-onboarding-invite";

const SUBJECT = "Set up your Saintly Home Health account";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlBody(firstName: string, signInUrl: string, signInPageUrl: string): string {
  const name = firstName.trim() || "there";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
<p>Hi ${escapeHtml(name)},</p>
<p>You have been invited to the Saintly Home Health web app. Use the link below to complete sign-in setup (you may be asked to set a password).</p>
<p><a href="${escapeHtml(signInUrl)}">${escapeHtml(signInUrl)}</a></p>
<p>If the link has expired, you can open the sign-in page and use your work email: <a href="${escapeHtml(signInPageUrl)}">${escapeHtml(signInPageUrl)}</a></p>
<p>If you did not expect this, you can ignore this message.</p>
<p>— Saintly Home Health</p>
</body></html>`;
}

function textBody(firstName: string, signInUrl: string, signInPageUrl: string): string {
  const name = firstName.trim() || "there";
  return `Hi ${name},

You have been invited to the Saintly Home Health web app. Open this link to complete sign-in setup (you may be asked to set a password).

${signInUrl}

If the link has expired, you can use the app sign-in page: ${signInPageUrl}

If you did not expect this, you can ignore this message.

— Saintly Home Health`;
}

export type SendStaffAuthInviteEmailInput = {
  to: string;
  firstName: string;
  signInUrl: string;
};

export type SendStaffAuthInviteEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Resend (same as onboarding and temp-password emails). No Supabase Auth email template is used.
 */
export async function sendStaffAuthInviteEmail(
  input: SendStaffAuthInviteEmailInput
): Promise<SendStaffAuthInviteEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid email address." };
  }
  if (!isOnboardingEmailConfigured()) {
    return { ok: false, error: ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR };
  }
  const signInPageUrl = getStaffSignInPageUrl();
  const apiKey = process.env.RESEND_API_KEY!.trim();
  const from = process.env.RESEND_FROM!.trim();
  const subject = SUBJECT;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: htmlBody(input.firstName, input.signInUrl, signInPageUrl),
        text: textBody(input.firstName, input.signInUrl, signInPageUrl),
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: t.slice(0, 400) || `Resend HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function staffAuthInviteEmailSubject(): string {
  return SUBJECT;
}
