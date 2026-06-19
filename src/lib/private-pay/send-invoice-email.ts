import "server-only";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";
import {
  getPrivatePayEmailSender,
  isPrivatePayEmailConfigured,
  sendPrivatePayResendEmail,
} from "@/lib/private-pay/email-from";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendPrivatePayInvoiceEmailInput = {
  to: string;
  billingName?: string | null;
  invoiceNumber: string;
  totalCents: number;
  link: string;
};

export { isPrivatePayEmailConfigured };

/**
 * HIPAA-safe invoice email: invoice number, amount, and a secure payment link only.
 */
export async function sendPrivatePayInvoiceEmail(
  input: SendPrivatePayInvoiceEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPrivatePayEmailConfigured()) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY)." };
  }

  const name = (input.billingName || "").trim() || "there";
  const amount = formatCentsUsd(input.totalCents);
  const subject = `Saintly Home Health Private Pay Invoice ${input.invoiceNumber}`;
  const sender = getPrivatePayEmailSender();

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your private-pay invoice from Saintly Home Health is ready.</p>
  <p style="font-size:16px;"><strong>Amount due: ${escapeHtml(amount)}</strong></p>
  <p>View your invoice and pay securely here:</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0369a1;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">View &amp; pay invoice</a>
  </p>
  <p style="font-size:13px;color:#475569;word-break:break-all;"><a href="${escapeHtml(input.link)}" style="color:#0369a1;">${escapeHtml(input.link)}</a></p>
  <p style="font-size:13px;color:#475569;">If you have already paid or need help, contact Saintly at ${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}.</p>
  <p style="font-size:12px;color:#94a3b8;">This message covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.</p>
  <p>Thank you,<br/>${escapeHtml(sender.name)}<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}</p>
</div>`;

  const text = `Hello ${name},

Your private-pay invoice from Saintly Home Health is ready.

Amount due: ${amount}

View your invoice and pay securely here:
${input.link}

If you have already paid or need help, contact Saintly at ${PRIVATE_PAY_BUSINESS.phoneDisplay}.

Thank you,
${PRIVATE_PAY_BUSINESS.phoneDisplay}`;

  const result = await sendPrivatePayResendEmail({ to: input.to, subject, html, text });
  if (!result.ok) {
    console.error("[private-pay] invoice email error:", result.error);
  }
  return result;
}
