import "server-only";

import { getRecruitingEmailSender, isRecruitingEmailConfigured } from "@/lib/recruiting/recruiting-email-from";
import { prepareRecruitingEmailPayload } from "@/lib/recruiting/recruiting-email-signature";

export type SendRecruitingEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; deliveryStatus: "failed" | "rejected" };

export async function sendRecruitingEmail(opts: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<SendRecruitingEmailResult> {
  if (!isRecruitingEmailConfigured()) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY).", deliveryStatus: "failed" };
  }

  const to = opts.to.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, error: "Invalid recipient email address.", deliveryStatus: "failed" };
  }

  const subject = opts.subject.trim();
  if (!subject) {
    return { ok: false, error: "Subject is required.", deliveryStatus: "failed" };
  }

  const bodyText = opts.bodyText.trim();
  if (!bodyText) {
    return { ok: false, error: "Email body is required.", deliveryStatus: "failed" };
  }

  const { text: emailText, html: emailHtml } = prepareRecruitingEmailPayload(bodyText);

  const key = process.env.RESEND_API_KEY!.trim();
  const { from, replyTo } = getRecruitingEmailSender();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [to],
      subject,
      text: emailText,
      html: emailHtml,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const deliveryStatus = res.status === 422 || res.status === 400 ? "rejected" : "failed";
    return {
      ok: false,
      error: body.slice(0, 500) || res.statusText || `Resend HTTP ${res.status}`,
      deliveryStatus,
    };
  }

  let providerMessageId: string | null = null;
  try {
    const json = (await res.json()) as { id?: string };
    providerMessageId = typeof json.id === "string" ? json.id : null;
  } catch {
    providerMessageId = null;
  }

  return { ok: true, providerMessageId };
}
