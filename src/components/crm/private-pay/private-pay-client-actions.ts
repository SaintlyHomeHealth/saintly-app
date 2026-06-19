"use client";

import type {
  PrivatePayInvoiceWithItems,
  PrivatePayPaymentMethodOnFile,
} from "@/lib/private-pay/types";

/**
 * Centralized client-side helpers for the simplified Private Pay workflow.
 * Every staff action (charge card, send invoice/receipt, mark paid, void) flows
 * through one of these so the admin workspace and the contact billing card stay
 * in sync. Each helper throws on failure with a friendly message.
 */

export type SendChannel = "email" | "text";

export type RecordPaymentPayload = {
  method: string;
  amount?: string;
  paid_at?: string;
  reference?: string | null;
  note?: string | null;
  send_receipt?: boolean;
  receipt_delivery?: "text" | "email" | "both";
};

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

/** Load the saved cards for a contact (for the charge-card flow). */
export async function loadPaymentMethods(
  contactId: string
): Promise<PrivatePayPaymentMethodOnFile[]> {
  const res = await fetch(`/api/private-pay/customers/${contactId}/payment-methods`);
  const json = await readJson<{
    ok?: boolean;
    paymentMethods?: PrivatePayPaymentMethodOnFile[];
    error?: string;
  }>(res);
  if (!res.ok || !json.ok) throw new Error(json.error || "Could not load saved cards");
  return json.paymentMethods ?? [];
}

/** Send the secure invoice link by email or text; marks the invoice sent. */
export async function sendInvoice(
  invoiceId: string,
  channel: SendChannel
): Promise<{ invoice: PrivatePayInvoiceWithItems | null; sentTo: string | null }> {
  const endpoint = channel === "email" ? "send-email" : "send-sms";
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}/${endpoint}`, { method: "POST" });
  const json = await readJson<{
    ok?: boolean;
    invoice?: PrivatePayInvoiceWithItems;
    sentTo?: string;
    error?: string;
  }>(res);
  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send invoice");
  return { invoice: json.invoice ?? null, sentTo: json.sentTo ?? null };
}

/** Send the receipt link for a paid invoice by email or text. */
export async function sendReceipt(
  invoiceId: string,
  channel: SendChannel
): Promise<{ sentTo: string | null }> {
  const endpoint = channel === "email" ? "send-receipt-email" : "send-receipt-sms";
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}/${endpoint}`, { method: "POST" });
  const json = await readJson<{ ok?: boolean; sentTo?: string; error?: string }>(res);
  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send receipt");
  return { sentTo: json.sentTo ?? null };
}

/** Record a confirmed manual payment and mark the invoice paid. */
export async function recordManualPayment(
  invoiceId: string,
  payload: RecordPaymentPayload
): Promise<{ invoice: PrivatePayInvoiceWithItems; receiptWarning: string | null }> {
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}/mark-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await readJson<{
    ok?: boolean;
    invoice?: PrivatePayInvoiceWithItems;
    receiptWarning?: string | null;
    error?: string;
  }>(res);
  if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to record payment");
  return { invoice: json.invoice, receiptWarning: json.receiptWarning ?? null };
}

/** Charge a saved card off-session for the invoice balance. */
export async function chargeSavedCard(
  invoiceId: string,
  paymentMethodId: string
): Promise<
  | { ok: true; invoice: PrivatePayInvoiceWithItems; message: string }
  | { ok: false; error: string; authUrl: string | null }
> {
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}/charge-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_method_id: paymentMethodId }),
  });
  const json = await readJson<{
    ok?: boolean;
    invoice?: PrivatePayInvoiceWithItems;
    message?: string;
    error?: string;
    authUrl?: string;
  }>(res);
  if (json.ok && json.invoice) {
    return { ok: true, invoice: json.invoice, message: json.message ?? "Card charged successfully." };
  }
  return { ok: false, error: json.error || "Card charge failed.", authUrl: json.authUrl ?? null };
}

/** Void an unpaid invoice. */
export async function voidInvoice(
  invoiceId: string
): Promise<PrivatePayInvoiceWithItems> {
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}/void`, { method: "POST" });
  const json = await readJson<{
    ok?: boolean;
    invoice?: PrivatePayInvoiceWithItems;
    error?: string;
  }>(res);
  if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to void invoice");
  return json.invoice;
}

/** Permanently delete a local invoice (blocked when Stripe payment exists). */
export async function hardDeleteInvoice(invoiceId: string): Promise<void> {
  const res = await fetch(`/api/private-pay/invoices/${invoiceId}`, { method: "DELETE" });
  const json = await readJson<{ ok?: boolean; error?: string }>(res);
  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to delete invoice");
}

/** Send a secure card-authorization link to the customer (email or text). */
export async function sendCardAuthLink(
  contactId: string,
  channel: SendChannel
): Promise<{ sentTo: string | null }> {
  const res = await fetch(`/api/private-pay/customers/${contactId}/send-card-auth-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  const json = await readJson<{ ok?: boolean; sentTo?: string; error?: string }>(res);
  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send card link");
  return { sentTo: json.sentTo ?? null };
}
