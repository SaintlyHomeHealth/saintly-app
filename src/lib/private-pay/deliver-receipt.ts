import "server-only";

import type { PrivatePayInvoiceWithItems } from "@/lib/private-pay/types";
import { buildPrivatePayInvoicePublicUrl } from "@/lib/private-pay/public-urls";
import { sendPrivatePayReceiptEmail, sendPrivatePayReceiptSms } from "@/lib/private-pay/send-receipt";
import { normalizeUsPhoneForSend } from "@/lib/phone/us-phone-format";

export type PrivatePayReceiptDelivery = "text" | "email" | "both";

export async function deliverPrivatePayReceipt(opts: {
  invoice: PrivatePayInvoiceWithItems;
  baseUrl: string;
  delivery: PrivatePayReceiptDelivery;
  phoneOverride?: string | null;
  emailOverride?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const receiptLink = buildPrivatePayInvoicePublicUrl(opts.invoice.public_token, opts.baseUrl);
  const errors: string[] = [];

  if (opts.delivery === "text" || opts.delivery === "both") {
    const digits = normalizeUsPhoneForSend(
      (opts.phoneOverride ?? "").trim() || (opts.invoice.billing_phone ?? "")
    );
    if (digits.length !== 10) {
      errors.push("No valid US mobile number for receipt text.");
    } else {
      const sms = await sendPrivatePayReceiptSms({ toE164: `+1${digits}`, receiptLink });
      if (!sms.ok) errors.push(sms.error);
    }
  }

  if (opts.delivery === "email" || opts.delivery === "both") {
    const to = (opts.emailOverride ?? "").trim() || (opts.invoice.billing_email ?? "").trim();
    if (!to.includes("@")) {
      errors.push("No billing email for receipt.");
    } else {
      const email = await sendPrivatePayReceiptEmail({
        to,
        billingName: opts.invoice.billing_name,
        invoiceNumber: opts.invoice.invoice_number,
        receiptLink,
      });
      if (!email.ok) errors.push(email.error);
    }
  }

  if (errors.length) return { ok: false, error: errors.join(" ") };
  return { ok: true };
}
