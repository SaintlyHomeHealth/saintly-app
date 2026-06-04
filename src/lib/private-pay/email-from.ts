import "server-only";

const DEFAULT_FROM_NAME = "Saintly Home Health Billing";
const DEFAULT_FROM_EMAIL = "billing@saintlyhomehealth.com";
const FALLBACK_FROM_NAME = "Saintly Home Health";
const FALLBACK_FROM_EMAIL = "info@saintlyhomehealth.com";

export type PrivatePayEmailSender = {
  /** Resend `from` header, e.g. Saintly Home Health Billing <billing@saintlyhomehealth.com> */
  from: string;
  replyTo: string;
  name: string;
};

export function getPrivatePayEmailSender(): PrivatePayEmailSender {
  const name = (process.env.PRIVATE_PAY_FROM_NAME ?? "").trim() || DEFAULT_FROM_NAME;
  const email = (process.env.PRIVATE_PAY_FROM_EMAIL ?? "").trim() || DEFAULT_FROM_EMAIL;
  const replyTo = (process.env.PRIVATE_PAY_REPLY_TO ?? "").trim() || email;
  const fromEmail = email.includes("@") ? email : FALLBACK_FROM_EMAIL;
  const fromName =
    name ||
    (fromEmail === FALLBACK_FROM_EMAIL ? FALLBACK_FROM_NAME : DEFAULT_FROM_NAME);
  const reply = replyTo.includes("@") ? replyTo : fromEmail;
  return { from: `${fromName} <${fromEmail}>`, replyTo: reply, name: fromName };
}

export function isPrivatePayEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendPrivatePayResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY)." };
  }
  const to = opts.to.trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, error: "Invalid email address." };

  const { from, replyTo } = getPrivatePayEmailSender();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || res.statusText };
  }
  return { ok: true };
}
