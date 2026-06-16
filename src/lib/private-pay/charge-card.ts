import "server-only";

import type Stripe from "stripe";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import {
  ensureStripeCustomerForContact,
  getPaymentMethodById,
  getPrivatePayCustomerByContactId,
  upsertPaymentMethodFromStripe,
} from "@/lib/private-pay/customers";
import {
  createPendingCardPayment,
  getInvoiceWithItems,
  recordStripePaymentFailed,
  recordStripePaymentSucceeded,
} from "@/lib/private-pay/data";
import { createPaymentAuthenticationCheckoutSession } from "@/lib/private-pay/checkout";
import { getStripe } from "@/lib/private-pay/stripe";

export type ChargeCardResult =
  | {
      ok: true;
      status: "succeeded";
      paymentIntentId: string;
      last4: string | null;
    }
  | {
      ok: false;
      status: "requires_action";
      paymentIntentId: string;
      authUrl: string;
      message: string;
    }
  | {
      ok: false;
      status: "failed";
      message: string;
      paymentIntentId?: string;
    };

function friendlyStripeError(error: Stripe.errors.StripeError | Error): string {
  if ("code" in error && error.code === "authentication_required") {
    return "Card authentication required — send the customer a secure payment link to complete verification.";
  }
  if ("decline_code" in error && error.decline_code) {
    const code = error.decline_code;
    if (code === "insufficient_funds") return "Card declined — insufficient funds.";
    if (code === "lost_card" || code === "stolen_card") return "Card declined — card cannot be used.";
    return `Card declined (${code}).`;
  }
  if ("type" in error && error.type === "card_error") {
    return error.message || "Card declined.";
  }
  return error.message || "Payment failed.";
}

/**
 * Charge a saved card off-session for a private-pay invoice.
 * Uses idempotency key invoice_id + amount_cents to prevent duplicate charges.
 */
export async function chargeInvoiceSavedCard(
  invoiceId: string,
  paymentMethodId: string,
  staffUserId: string | null,
  origin: string
): Promise<ChargeCardResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: "failed", message: "Stripe is not configured. Set STRIPE_SECRET_KEY." };
  }

  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return { ok: false, status: "failed", message: "Invoice not found." };
  }
  if (invoice.status === "paid") {
    return { ok: false, status: "failed", message: "Invoice is already paid." };
  }
  if (invoice.status === "void") {
    return { ok: false, status: "failed", message: "This invoice is no longer payable." };
  }
  if (!invoice.contact_id) {
    return { ok: false, status: "failed", message: "Invoice has no linked contact for saved cards." };
  }

  const amountCents = invoice.total_cents;
  if (amountCents <= 0) {
    return { ok: false, status: "failed", message: "Invoice total must be greater than $0." };
  }

  const pendingPayment = invoice.payments.find((p) => p.status === "pending" && p.payment_method === "card");
  if (pendingPayment) {
    return {
      ok: false,
      status: "failed",
      message: "A card charge is already processing for this invoice. Wait for it to complete.",
    };
  }

  const pm = await getPaymentMethodById(paymentMethodId);
  if (!pm) {
    return { ok: false, status: "failed", message: "Saved card not found." };
  }

  const ppc = await getPrivatePayCustomerByContactId(invoice.contact_id);
  if (!ppc || pm.customer_id !== ppc.id) {
    return { ok: false, status: "failed", message: "Saved card does not belong to this customer." };
  }
  if (!ppc.stripe_customer_id) {
    return { ok: false, status: "failed", message: "Stripe customer not configured for this contact." };
  }

  if (!pm.consent_collected_at) {
    return {
      ok: false,
      status: "failed",
      message: "Card authorization consent was not collected. Add the card again with customer consent.",
    };
  }

  const { stripeCustomerId } = await ensureStripeCustomerForContact(invoice.contact_id, {
    name: invoice.billing_name,
    email: invoice.billing_email,
    phone: invoice.billing_phone,
  });

  let pendingRowId: string | null = null;
  try {
    const pending = await createPendingCardPayment({
      invoiceId,
      customerId: ppc.id,
      amountCents,
      stripePaymentMethodId: pm.stripe_payment_method_id,
      createdBy: staffUserId,
    });
    pendingRowId = pending.id;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start charge.";
    return { ok: false, status: "failed", message };
  }

  const idempotencyKey = `pp-charge-${invoiceId}-${amountCents}`;

  const metadata: Record<string, string> = {
    private_pay_invoice_id: invoice.id,
    invoice_id: invoice.id,
    customer_id: ppc.id,
    invoice_number: invoice.invoice_number,
    saintly_private_pay: "true",
  };

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: pm.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata,
        description: `Invoice ${invoice.invoice_number}`,
      },
      { idempotencyKey }
    );

    if (pi.status === "succeeded") {
      const card = pm.last4;
      await recordStripePaymentSucceeded({
        invoiceId,
        amountCents: pi.amount_received || amountCents,
        stripePaymentIntentId: pi.id,
        stripeCustomerId,
        cardBrand: pm.brand,
        cardLast4: pm.last4,
        customerId: ppc.id,
        stripePaymentMethodId: pm.stripe_payment_method_id,
        pendingPaymentId: pendingRowId,
      });

      await insertAuditLogTrusted({
        action: "private_pay_card_charged",
        entityType: "private_pay_invoice",
        entityId: invoiceId,
        metadata: {
          invoice_number: invoice.invoice_number,
          amount_cents: amountCents,
          last4: card,
          payment_intent_id: pi.id,
        },
      });

      return {
        ok: true,
        status: "succeeded",
        paymentIntentId: pi.id,
        last4: pm.last4,
      };
    }

    if (pi.status === "requires_action") {
      const authCheckout = await createPaymentAuthenticationCheckoutSession(pi.id, origin);
      const authUrl = authCheckout.ok ? authCheckout.url : "";
      await recordStripePaymentFailed({
        invoiceId,
        amountCents,
        stripePaymentIntentId: pi.id,
        failureMessage: "Authentication required",
        customerId: ppc.id,
        stripePaymentMethodId: pm.stripe_payment_method_id,
        pendingPaymentId: pendingRowId,
      });

      return {
        ok: false,
        status: "requires_action",
        paymentIntentId: pi.id,
        authUrl,
        message: "The customer must complete card authentication. Send them a secure payment link.",
      };
    }

    await recordStripePaymentFailed({
      invoiceId,
      amountCents,
      stripePaymentIntentId: pi.id,
      failureMessage: `Unexpected status: ${pi.status}`,
      customerId: ppc.id,
      stripePaymentMethodId: pm.stripe_payment_method_id,
      pendingPaymentId: pendingRowId,
    });
    return { ok: false, status: "failed", message: `Payment did not complete (${pi.status}).`, paymentIntentId: pi.id };
  } catch (e) {
    const stripeError = e as Stripe.errors.StripeError;
    const message = friendlyStripeError(stripeError);
    const piId =
      stripeError && "payment_intent" in stripeError && stripeError.payment_intent
        ? typeof stripeError.payment_intent === "string"
          ? stripeError.payment_intent
          : stripeError.payment_intent.id
        : undefined;

    if (piId) {
      if (stripeError.code === "authentication_required") {
        const authCheckout = await createPaymentAuthenticationCheckoutSession(piId, origin);
        await recordStripePaymentFailed({
          invoiceId,
          amountCents,
          stripePaymentIntentId: piId,
          failureMessage: message,
          customerId: ppc.id,
          stripePaymentMethodId: pm.stripe_payment_method_id,
          pendingPaymentId: pendingRowId,
        });
        return {
          ok: false,
          status: "requires_action",
          paymentIntentId: piId,
          authUrl: authCheckout.ok ? authCheckout.url : "",
          message,
        };
      }

      await recordStripePaymentFailed({
        invoiceId,
        amountCents,
        stripePaymentIntentId: piId,
        failureMessage: message,
        customerId: ppc.id,
        stripePaymentMethodId: pm.stripe_payment_method_id,
        pendingPaymentId: pendingRowId,
      });
    } else if (pendingRowId) {
      await recordStripePaymentFailed({
        invoiceId,
        amountCents,
        failureMessage: message,
        customerId: ppc.id,
        stripePaymentMethodId: pm.stripe_payment_method_id,
        pendingPaymentId: pendingRowId,
      });
    }

    return { ok: false, status: "failed", message, paymentIntentId: piId };
  }
}

/** Process setup_intent.succeeded — attach card metadata after Checkout setup or SetupIntent. */
export async function handleSetupIntentSucceeded(setupIntentId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const si = await stripe.setupIntents.retrieve(setupIntentId);
  const customerIdMeta = si.metadata?.private_pay_customer_id;
  const contactId = si.metadata?.private_pay_contact_id;
  const stripePmId =
    typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;

  if (!stripePmId) return;

  let ppcCustomerId = customerIdMeta ?? null;
  if (!ppcCustomerId && contactId) {
    const ppc = await getPrivatePayCustomerByContactId(contactId);
    ppcCustomerId = ppc?.id ?? null;
  }
  if (!ppcCustomerId) return;

  const stripeCustomerId = typeof si.customer === "string" ? si.customer : si.customer?.id ?? null;
  if (stripeCustomerId && contactId) {
    await ensureStripeCustomerForContact(contactId);
    await stripe.paymentMethods.attach(stripePmId, { customer: stripeCustomerId }).catch(() => undefined);
  }

  await upsertPaymentMethodFromStripe(ppcCustomerId, stripePmId, {
    consentCollectedAt: new Date().toISOString(),
    makeDefault: true,
  });
}
