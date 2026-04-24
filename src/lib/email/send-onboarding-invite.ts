import "server-only";

const SUBJECT_INVITE = "Complete your Saintly Home Health onboarding";
const SUBJECT_RESUME = "Resume your Saintly Home Health onboarding";

const REUSABLE_LINK_NOTE_HTML =
  "<p>This link does not expire and is not single-use—you can bookmark it or open it on another device to pick up where you left off.</p>";
const REUSABLE_LINK_NOTE_TEXT =
  "This link does not expire and is not single-use—you can bookmark it or open it on another device to pick up where you left off.\n\n";

function ctaButtonHtml(href: string, label: string): string {
  return `<p style="margin:28px 0;">
  <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(
    label
  )}</a>
</p>`;
}

function htmlBody(firstName: string, link: string, variant: "invite" | "resume"): string {
  const name = firstName.trim() || "there";
  const ctaLabel = variant === "resume" ? "Resume your onboarding" : "Complete your setup";
  const intro =
    variant === "resume"
      ? `<p>Hi ${escapeHtml(name)},</p>
<p>Use the button below to return to your Saintly Home Health onboarding (works on mobile):</p>`
      : `<p>Hi ${escapeHtml(name)},</p>
<p>Welcome to Saintly Home Health. Please complete your secure onboarding using the button below (works on mobile):</p>`;
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
${intro}
${REUSABLE_LINK_NOTE_HTML}
${ctaButtonHtml(link, ctaLabel)}
<p>If you did not expect this message, you can ignore it.</p>
<p>— Saintly Home Health</p>
</body></html>`;
}

function textBody(firstName: string, link: string, variant: "invite" | "resume"): string {
  const name = firstName.trim() || "there";
  const intro =
    variant === "resume"
      ? `Hi ${name},

Use the link below to return to your Saintly Home Health onboarding:`
      : `Hi ${name},

Welcome to Saintly Home Health. Please complete your onboarding here:`;
  return `${intro}

${REUSABLE_LINK_NOTE_TEXT}${link}

If you did not expect this message, you can ignore it.

— Saintly Home Health`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendOnboardingInviteEmailInput = {
  to: string;
  firstName: string;
  link: string;
  /** Default invite copy; resume uses return-to-onboarding wording. */
  variant?: "invite" | "resume";
};

export type SendOnboardingInviteEmailResult = { ok: true } | { ok: false; error: string };

/** Shared with onboarding invite flow (Add Employee, resend). */
export const ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR =
  "Email is not configured. Set RESEND_API_KEY and RESEND_FROM (verified sender) to enable onboarding emails.";

export function isOnboardingEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

/**
 * Optional Resend integration. Set RESEND_API_KEY and RESEND_FROM (e.g. "Onboarding <onboarding@yourdomain.com>").
 */
export async function sendOnboardingInviteEmail(
  input: SendOnboardingInviteEmailInput
): Promise<SendOnboardingInviteEmailResult> {
  const to = input.to.trim().toLowerCase();
  const variant = input.variant ?? "invite";

  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid email address." };
  }

  if (!isOnboardingEmailConfigured()) {
    return { ok: false, error: ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR };
  }

  const apiKey = process.env.RESEND_API_KEY!.trim();
  const from = process.env.RESEND_FROM!.trim();
  const subject = variant === "resume" ? SUBJECT_RESUME : SUBJECT_INVITE;

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
        html: htmlBody(input.firstName, input.link, variant),
        text: textBody(input.firstName, input.link, variant),
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
