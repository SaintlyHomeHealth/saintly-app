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
  const subject = `Invoice ${input.invoiceNumber} from ${PRIVATE_PAY_BUSINESS.legalName}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your private-pay invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> from
  ${escapeHtml(PRIVATE_PAY_BUSINESS.legalName)} is ready.</p>
  <p style="font-size:18px;"><strong>Amount due: ${escapeHtml(amount)}</strong></p>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0369a1;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Pay securely</a>
  </p>
  <p style="font-size:13px;color:#475569;">You can pay by card or Apple Pay through the secure link above. Payments are processed by Stripe; Saintly never sees your full card number.</p>
  <p style="font-size:12px;color:#94a3b8;">This message covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.</p>
  <p>— ${escapeHtml(PRIVATE_PAY_BUSINESS.legalName)}<br/>${escapeHtml(PRIVATE_PAY_BUSINESS.phoneDisplay)}</p>
</div>`;

  const text = `Hi ${name},

Your private-pay invoice ${input.invoiceNumber} from ${PRIVATE_PAY_BUSINESS.legalName} is ready.
Amount due: ${amount}

Pay securely: ${input.link}

You can pay by card or Apple Pay through the secure link. Payments are processed by Stripe.

— ${PRIVATE_PAY_BUSINESS.legalName}
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
