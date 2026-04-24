import "server-only";

import { isOnboardingEmailConfigured, ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR } from "@/lib/email/send-onboarding-invite";

const SUBJECT = "Set up your Saintly Home Health account";

/** User-facing sign-in in invite emails; avoids Supabase action links, tokens, and long query strings in the body. */
const STAFF_INVITE_EMAIL_LOGIN_URL = "https://www.saintlyhomehealth.com/admin/login";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ctaButtonHtml(href: string, label: string): string {
  return `<p style="margin:28px 0;">
  <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(
    label
  )}</a>
</p>`;
}

function htmlBody(firstName: string, _signInUrl: string, staffLoginUrl: string): string {
  const name = firstName.trim() || "there";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
<p>Hi ${escapeHtml(name)},</p>
<p>You have been invited to the Saintly Home Health web app. Use the button below to complete your account sign-in (you may be asked to set a password).</p>
${ctaButtonHtml(staffLoginUrl, "Complete your setup")}
<p>You can also open the sign-in page and use your work email:<br>
<a href="${escapeHtml(staffLoginUrl)}">${escapeHtml(staffLoginUrl)}</a></p>
<p>If you did not expect this, you can ignore this message.</p>
<p>— Saintly Home Health</p>
</body></html>`;
}

function textBody(firstName: string, _signInUrl: string, staffLoginUrl: string): string {
  const name = firstName.trim() || "there";
  return `Hi ${name},

You have been invited to the Saintly Home Health web app. Complete your account sign-in at the page below (you may be asked to set a password).

Complete your setup:
${staffLoginUrl}

You can also open the sign-in page and use your work email:
${staffLoginUrl}

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
  const staffLoginUrl = STAFF_INVITE_EMAIL_LOGIN_URL;
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
        html: htmlBody(input.firstName, input.signInUrl, staffLoginUrl),
        text: textBody(input.firstName, input.signInUrl, staffLoginUrl),
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
