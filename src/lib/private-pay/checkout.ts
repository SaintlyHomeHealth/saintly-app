import "server-only";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import { attachCheckoutSession } from "@/lib/private-pay/data";
import { ensureStripeCustomerForContact } from "@/lib/private-pay/customers";
import { serviceTypeLabel } from "@/lib/private-pay/format";
import { getStripe } from "@/lib/private-pay/stripe";
import type { PrivatePayInvoiceWithItems } from "@/lib/private-pay/types";

export type CreateCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * Stripe Checkout in setup mode — saves a card on the Stripe Customer for future
 * off-session charges. Staff or customer completes card entry on Stripe-hosted pages.
 */
export async function createCardSetupCheckoutSession(
  contactId: string,
  origin: string,
  billing?: { name?: string | null; email?: string | null; phone?: string | null }
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, error: "Stripe is not configured. Set STRIPE_SECRET_KEY." };
  }

  try {
    const { customer, stripeCustomerId } = await ensureStripeCustomerForContact(contactId, billing);
    const cleanOrigin = origin.replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: {
        saintly_private_pay: "true",
        private_pay_contact_id: contactId,
        private_pay_customer_id: customer.id,
        card_setup: "true",
      },
      setup_intent_data: {
        metadata: {
          saintly_private_pay: "true",
          private_pay_contact_id: contactId,
          private_pay_customer_id: customer.id,
          card_setup: "true",
        },
      },
      success_url: `${cleanOrigin}/private-pay/card-setup/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cleanOrigin}/private-pay/card-setup/thank-you?status=cancelled`,
    });

    if (!session.url) {
      return { ok: false, status: 502, error: "Stripe did not return a checkout URL" };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create card setup session";
    console.error("[private-pay] card setup checkout error", message);
    return { ok: false, status: 502, error: message };
  }
}

/**
 * One-time payment Checkout for an invoice (customer pays themselves).
 * Distinct from off-session staff charge of a saved card.
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

  const lineItems = simple
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
    saintly_private_pay: "true",
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

/**
 * Checkout session for a PaymentIntent that requires customer authentication (3DS).
 */
export async function createPaymentAuthenticationCheckoutSession(
  paymentIntentId: string,
  origin: string
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, error: "Stripe is not configured." };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const cleanOrigin = origin.replace(/\/$/, "");
    const invoiceNumber = pi.metadata?.invoice_number ?? "";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_intent: paymentIntentId,
      success_url: `${cleanOrigin}/private-pay/thank-you?invoice=${encodeURIComponent(invoiceNumber)}`,
      cancel_url: `${cleanOrigin}/private-pay/thank-you?status=cancelled&invoice=${encodeURIComponent(
        invoiceNumber
      )}`,
      metadata: {
        saintly_private_pay: "true",
        private_pay_invoice_id: pi.metadata?.private_pay_invoice_id ?? "",
        invoice_number: invoiceNumber,
        auth_retry: "true",
      },
    });

    if (!session.url) {
      return { ok: false, status: 502, error: "Stripe did not return a checkout URL" };
    }
    return { ok: true, url: session.url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create authentication checkout";
    return { ok: false, status: 502, error: message };
  }
}
