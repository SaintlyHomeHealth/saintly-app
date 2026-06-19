import "server-only";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import {
  getPrivatePayEmailSender,
  isPrivatePayEmailConfigured,
  sendPrivatePayResendEmail,
} from "@/lib/private-pay/email-from";
import { sendSms } from "@/lib/twilio/send-sms";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendPrivatePayReceiptEmailInput = {
  to: string;
  billingName?: string | null;
  invoiceNumber: string;
  receiptLink: string;
};

export { isPrivatePayEmailConfigured };

export async function sendPrivatePayReceiptEmail(
  input: SendPrivatePayReceiptEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPrivatePayEmailConfigured()) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY)." };
  }

  const name = (input.billingName || "").trim() || "there";
  const subject = `Saintly Home Health Payment Receipt ${input.invoiceNumber}`;
  const sender = getPrivatePayEmailSender();

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your payment has been received. Thank you!</p>
  <p>View/download your receipt here:</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.receiptLink)}" style="display:inline-block;background:#047857;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">View receipt</a>
  </p>
  <p style="font-size:13px;color:#475569;word-break:break-all;"><a href="${escapeHtml(input.receiptLink)}" style="color:#047857;">${escapeHtml(input.receiptLink)}</a></p>
  <p style="font-size:12px;color:#94a3b8;">This message covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.</p>
  <p>Thank you,<br/>${escapeHtml(sender.name)}<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}</p>
</div>`;

  const text = `Hello ${name},

Your payment has been received. Thank you!

View/download your receipt here:
${input.receiptLink}

Thank you,
${PRIVATE_PAY_BUSINESS.phoneDisplay}`;

  const result = await sendPrivatePayResendEmail({ to: input.to, subject, html, text });
  if (!result.ok) {
    console.error("[private-pay] receipt email error:", result.error);
  }
  return result;
}

export function buildPrivatePayReceiptSmsBody(receiptLink: string): string {
  return `Saintly Home Health: Your payment has been received. View/download your receipt here: ${receiptLink}`;
}

export async function sendPrivatePayReceiptSms(opts: {
  toE164: string;
  receiptLink: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendSms({ to: opts.toE164, body: buildPrivatePayReceiptSmsBody(opts.receiptLink) });
}

export function buildPrivatePayInvoiceSmsBody(invoiceLink: string): string {
  return `Saintly Home Health: Your private-pay invoice is ready. View it and pay securely here: ${invoiceLink}`;
}
