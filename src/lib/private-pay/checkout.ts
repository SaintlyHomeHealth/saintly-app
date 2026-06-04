import "server-only";

import type Stripe from "stripe";

import { attachCheckoutSession } from "@/lib/private-pay/data";
import { getStripe } from "@/lib/private-pay/stripe";
import { serviceTypeLabel } from "@/lib/private-pay/format";
import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import type { PrivatePayInvoiceWithItems } from "@/lib/private-pay/types";

export type CreateCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * Create a Stripe Checkout session for a private-pay invoice. Stripe Checkout
 * automatically offers Apple Pay (and other wallets) when available, so we do
 * not pass payment_method_types. Shared by the staff route and the public link.
 */
export async function createInvoiceCheckoutSession(
  invoice: PrivatePayInvoiceWithItems,
  origin: string
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, error: "Stripe is not configured. Set STRIPE_SECRET_KEY." };
  }
  if (invoice.status === "paid") {
    return { ok: false, status: 400, error: "Invoice is already paid" };
  }
  if (invoice.status === "void") {
    return { ok: false, status: 400, error: "This invoice is no longer payable." };
  }
  if (invoice.total_cents <= 0) {
    return { ok: false, status: 400, error: "Invoice total must be greater than $0" };
  }

  const cleanOrigin = origin.replace(/\/$/, "");
  const simple = invoice.discount_cents === 0 && invoice.tax_cents === 0;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = simple
    ? invoice.items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: item.line_total_cents,
          product_data: {
            name: (item.description ?? "").trim() || serviceTypeLabel(item.service_type),
          },
        },
      }))
    : [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: invoice.total_cents,
            product_data: {
              name: `${PRIVATE_PAY_BUSINESS.legalName} — Invoice ${invoice.invoice_number}`,
            },
          },
        },
      ];

  const metadata: Record<string, string> = {
    private_pay_invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: (invoice.billing_email ?? "").trim() || undefined,
      client_reference_id: invoice.id,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${cleanOrigin}/private-pay/thank-you?invoice=${encodeURIComponent(
        invoice.invoice_number
      )}`,
      cancel_url: `${cleanOrigin}/private-pay/thank-you?status=cancelled&invoice=${encodeURIComponent(
        invoice.invoice_number
      )}`,
    });

    if (!session.url) {
      return { ok: false, status: 502, error: "Stripe did not return a checkout URL" };
    }

    await attachCheckoutSession(invoice.id, {
      sessionId: session.id,
      customerId: typeof session.customer === "string" ? session.customer : null,
    });

    return { ok: true, url: session.url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create checkout session";
    console.error("[private-pay] checkout error", message);
    return { ok: false, status: 502, error: message };
  }
}
