import "server-only";

const SUBJECT = "Your Saintly app sign-in password";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlBody(firstName: string, loginUrl: string, temporaryPassword: string): string {
  const name = firstName.trim() || "there";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
<p>Hi ${escapeHtml(name)},</p>
<p>An administrator created a temporary password for your Saintly Home Health account. <strong>This message is the only time this password is sent by email.</strong> Please save it securely.</p>
<p><strong>Temporary password:</strong> <code style="font-size:15px;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(temporaryPassword)}</code></p>
<p><strong>Sign in:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
<p>You may be asked to choose a new password after you sign in.</p>
<p>— Saintly Home Health</p>
</body></html>`;
}

function textBody(firstName: string, loginUrl: string, temporaryPassword: string): string {
  const name = firstName.trim() || "there";
  return `Hi ${name},

An administrator created a temporary password for your Saintly Home Health account. This message is the only time this password is sent by email. Save it securely.

Temporary password: ${temporaryPassword}

Sign in: ${loginUrl}

You may be asked to choose a new password after you sign in.

— Saintly Home Health`;
}

export type SendStaffAccessCredentialsEmailInput = {
  to: string;
  firstName: string;
  loginUrl: string;
  temporaryPassword: string;
};

export type SendStaffAccessCredentialsEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Uses Resend when RESEND_API_KEY and RESEND_FROM are set (same as onboarding emails).
 */
export async function sendStaffAccessCredentialsEmail(
  input: SendStaffAccessCredentialsEmailInput
): Promise<SendStaffAccessCredentialsEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const to = input.to.trim().toLowerCase();

  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid email address." };
  }

  if (!apiKey || !from) {
    return {
      ok: false,
      error:
        "Email is not configured. Set RESEND_API_KEY and RESEND_FROM (verified sender), or copy the password and share it another way.",
    };
  }

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
        subject: SUBJECT,
        html: htmlBody(input.firstName, input.loginUrl, input.temporaryPassword),
        text: textBody(input.firstName, input.loginUrl, input.temporaryPassword),
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
