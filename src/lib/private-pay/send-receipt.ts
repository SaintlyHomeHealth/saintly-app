import "server-only";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
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

export async function sendPrivatePayReceiptEmail(
  input: SendPrivatePayReceiptEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY / RESEND_FROM)." };
  }
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, error: "Invalid email address." };

  const name = (input.billingName || "").trim() || "there";
  const subject = `${PRIVATE_PAY_BUSINESS.legalName} Payment Receipt ${input.invoiceNumber}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your payment has been received. Thank you!</p>
  <p>View/download your receipt here:</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.receiptLink)}" style="display:inline-block;background:#047857;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">View receipt</a>
  </p>
  <p style="font-size:13px;color:#475569;word-break:break-all;"><a href="${escapeHtml(input.receiptLink)}" style="color:#047857;">${escapeHtml(input.receiptLink)}</a></p>
  <p style="font-size:12px;color:#94a3b8;">This message covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.</p>
  <p>Thank you,<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.legalName)}<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}</p>
</div>`;

  const text = `Hello ${name},

Your payment has been received. Thank you!

View/download your receipt here:
${input.receiptLink}

Thank you,
${PRIVATE_PAY_BUSINESS.legalName}
${PRIVATE_PAY_BUSINESS.phoneDisplay}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[private-pay] receipt email error:", body || res.statusText);
    return { ok: false, error: body || res.statusText };
  }
  return { ok: true };
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
  return `Saintly Home Health: Your private-pay invoice is ready. You can view/download it and see payment options here: ${invoiceLink}`;
}
