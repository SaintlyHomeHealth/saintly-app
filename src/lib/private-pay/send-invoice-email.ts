import "server-only";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";

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

export function isPrivatePayEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

/**
 * HIPAA-safe invoice email: invoice number, amount, and a secure payment link only.
 * No diagnosis, insurance, Medicare, or clinical details are included.
 */
export async function sendPrivatePayInvoiceEmail(
  input: SendPrivatePayInvoiceEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY / RESEND_FROM)." };
  }
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, error: "Invalid email address." };

  const name = (input.billingName || "").trim() || "there";
  const amount = formatCentsUsd(input.totalCents);
  const subject = `${PRIVATE_PAY_BUSINESS.legalName} Private Pay Invoice ${input.invoiceNumber}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your ${escapeHtml(PRIVATE_PAY_BUSINESS.legalName)} private-pay invoice is ready.</p>
  <p style="font-size:16px;"><strong>Amount due: ${escapeHtml(amount)}</strong></p>
  <p>View/download your invoice and payment options here:</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0369a1;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">View invoice &amp; pay securely</a>
  </p>
  <p style="font-size:13px;color:#475569;word-break:break-all;"><a href="${escapeHtml(input.link)}" style="color:#0369a1;">${escapeHtml(input.link)}</a></p>
  <p style="font-size:12px;color:#94a3b8;">This message covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.</p>
  <p>Thank you,<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.legalName)}<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}</p>
</div>`;

  const text = `Hello ${name},

Your ${PRIVATE_PAY_BUSINESS.legalName} private-pay invoice is ready.

View/download your invoice and payment options here:
${input.link}

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
    console.error("[private-pay] invoice email error:", body || res.statusText);
    return { ok: false, error: body || res.statusText };
  }
  return { ok: true };
}
