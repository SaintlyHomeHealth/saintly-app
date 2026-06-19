import "server-only";

import type Stripe from "stripe";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import {
  ensureStripeCustomerForContact,
  listPaymentMethodsForContact,
  upsertPaymentMethodFromStripe,
} from "@/lib/private-pay/customers";
import {
  createPendingCardPayment,
  getInvoiceWithItems,
  recordStripePaymentFailed,
  recordStripePaymentSucceeded,
} from "@/lib/private-pay/data";
import { friendlyStripeError } from "@/lib/private-pay/stripe-errors";
import { getStripe } from "@/lib/private-pay/stripe";
import type { PrivatePayInvoiceWithItems, PrivatePayPaymentMethodOnFile } from "@/lib/private-pay/types";

export type ChargeNewCardResult =
  | {
      ok: true;
      status: "succeeded";
      invoice: PrivatePayInvoiceWithItems;
      paymentMethods: PrivatePayPaymentMethodOnFile[];
      message: string;
      last4: string | null;
    }
  | {
      ok: false;
      status: "requires_action";
      paymentIntentId: string;
      clientSecret: string;
      message: string;
    }
  | {
      ok: false;
      status: "failed";
      message: string;
      paymentIntentId?: string;
    };

function buildPaymentMetadata(
  invoice: PrivatePayInvoiceWithItems,
  ppcId: string
): Record<string, string> {
  return {
    private_pay_invoice_id: invoice.id,
    invoice_id: invoice.id,
    customer_id: ppcId,
    invoice_number: invoice.invoice_number,
    saintly_private_pay: "true",
    phone_card_entry: "true",
  };
}

async function detachIfAttached(stripe: Stripe, stripePaymentMethodId: string): Promise<void> {
  try {
    await stripe.paymentMethods.detach(stripePaymentMethodId);
  } catch {
    // Best-effort cleanup when charge fails after attach.
  }
}

async function saveCardAndRecordSuccess(opts: {
  invoiceId: string;
  contactId: string;
  ppcId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  stripePaymentIntentId: string;
  amountCents: number;
  pendingPaymentId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  makeDefault: boolean;
}): Promise<{ invoice: PrivatePayInvoiceWithItems; paymentMethods: PrivatePayPaymentMethodOnFile[] }> {
  const consentAt = new Date().toISOString();
  await upsertPaymentMethodFromStripe(opts.ppcId, opts.stripePaymentMethodId, {
    consentCollectedAt: consentAt,
    makeDefault: opts.makeDefault,
  });

  await recordStripePaymentSucceeded({
    invoiceId: opts.invoiceId,
    amountCents: opts.amountCents,
    stripePaymentIntentId: opts.stripePaymentIntentId,
    stripeCustomerId: opts.stripeCustomerId,
    cardBrand: opts.cardBrand,
    cardLast4: opts.cardLast4,
    customerId: opts.ppcId,
    stripePaymentMethodId: opts.stripePaymentMethodId,
    pendingPaymentId: opts.pendingPaymentId,
  });

  const invoice = await getInvoiceWithItems(opts.invoiceId);
  const paymentMethods = await listPaymentMethodsForContact(opts.contactId);
  if (!invoice) throw new Error("Invoice not found after payment.");
  return { invoice, paymentMethods };
}

/**
 * Charge an invoice with a Stripe-tokenized PaymentMethod created client-side (Stripe Elements).
 * Saves the card on file only after a successful charge.
 */
export async function chargeInvoiceWithNewPaymentMethod(
  invoiceId: string,
  stripePaymentMethodId: string,
  staffUserId: string | null,
  opts: { consentAuthorized: boolean }
): Promise<ChargeNewCardResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: "failed", message: "Stripe is not configured. Set STRIPE_SECRET_KEY." };
  }
  if (!opts.consentAuthorized) {
    return {
      ok: false,
      status: "failed",
      message: "Client authorization is required before charging and saving the card.",
    };
  }

  const trimmedPmId = (stripePaymentMethodId ?? "").trim();
  if (!trimmedPmId || !trimmedPmId.startsWith("pm_")) {
    return { ok: false, status: "failed", message: "Invalid payment method." };
  }

  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) return { ok: false, status: "failed", message: "Invoice not found." };
  if (invoice.status === "paid") return { ok: false, status: "failed", message: "Invoice is already paid." };
  if (invoice.status === "void") {
    return { ok: false, status: "failed", message: "This invoice is no longer payable." };
  }
  if (!invoice.contact_id) {
    return {
      ok: false,
      status: "failed",
      message: "Link a contact to this invoice before charging and saving a card.",
    };
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

  let pm: Stripe.PaymentMethod;
  try {
    pm = await stripe.paymentMethods.retrieve(trimmedPmId);
  } catch {
    return { ok: false, status: "failed", message: "Could not load the payment method from Stripe." };
  }
  if (pm.type !== "card" || !pm.card) {
    return { ok: false, status: "failed", message: "Only card payment methods are supported." };
  }

  const { customer: ppc, stripeCustomerId } = await ensureStripeCustomerForContact(invoice.contact_id, {
    name: invoice.billing_name,
    email: invoice.billing_email,
    phone: invoice.billing_phone,
  });

  const existingMethods = await listPaymentMethodsForContact(invoice.contact_id);
  const makeDefault = existingMethods.length === 0;

  let attached = false;
  let pendingRowId: string | null = null;

  try {
    await stripe.paymentMethods.attach(trimmedPmId, { customer: stripeCustomerId });
    attached = true;

    if (makeDefault) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: trimmedPmId },
      });
    }

    const pending = await createPendingCardPayment({
      invoiceId,
      customerId: ppc.id,
      amountCents,
      stripePaymentMethodId: trimmedPmId,
      createdBy: staffUserId,
    });
    pendingRowId = pending.id;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not prepare card charge.";
    return { ok: false, status: "failed", message };
  }

  const metadata = buildPaymentMetadata(invoice, ppc.id);
  const idempotencyKey = `pp-new-card-${invoiceId}-${amountCents}-${trimmedPmId.slice(-8)}`;

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: trimmedPmId,
        confirm: true,
        setup_future_usage: "off_session",
        metadata,
        description: `Invoice ${invoice.invoice_number}`,
      },
      { idempotencyKey }
    );

    if (pi.status === "succeeded") {
      const { invoice: updated, paymentMethods } = await saveCardAndRecordSuccess({
        invoiceId,
        contactId: invoice.contact_id,
        ppcId: ppc.id,
        stripeCustomerId,
        stripePaymentMethodId: trimmedPmId,
        stripePaymentIntentId: pi.id,
        amountCents: pi.amount_received || amountCents,
        pendingPaymentId: pendingRowId,
        cardBrand: pm.card.brand ?? null,
        cardLast4: pm.card.last4 ?? null,
        makeDefault,
      });

      await insertAuditLogTrusted({
        action: "private_pay_card_charged",
        entityType: "private_pay_invoice",
        entityId: invoiceId,
        metadata: {
          invoice_number: invoice.invoice_number,
          amount_cents: amountCents,
          last4: pm.card.last4,
          payment_intent_id: pi.id,
          phone_card_entry: true,
        },
      });

      return {
        ok: true,
        status: "succeeded",
        invoice: updated,
        paymentMethods,
        message: `Card charged and saved ending in ${pm.card.last4 ?? "****"}.`,
        last4: pm.card.last4 ?? null,
      };
    }

    if (pi.status === "requires_action" && pi.client_secret) {
      return {
        ok: false,
        status: "requires_action",
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        message: "This card requires additional verification. Complete authentication to finish the charge.",
      };
    }

    await recordStripePaymentFailed({
      invoiceId,
      amountCents,
      stripePaymentIntentId: pi.id,
      failureMessage: `Unexpected status: ${pi.status}`,
      customerId: ppc.id,
      stripePaymentMethodId: trimmedPmId,
      pendingPaymentId: pendingRowId,
    });
    if (attached) await detachIfAttached(stripe, trimmedPmId);

    return {
      ok: false,
      status: "failed",
      message: `Payment did not complete (${pi.status}).`,
      paymentIntentId: pi.id,
    };
  } catch (e) {
    const stripeError = e as Stripe.errors.StripeError;
    const message = friendlyStripeError(stripeError);
    const piId =
      stripeError && "payment_intent" in stripeError && stripeError.payment_intent
        ? typeof stripeError.payment_intent === "string"
          ? stripeError.payment_intent
          : stripeError.payment_intent.id
        : undefined;

    if (stripeError.code === "authentication_required" && piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.client_secret) {
          return {
            ok: false,
            status: "requires_action",
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            message,
          };
        }
      } catch {
        // fall through to failure handling
      }
    }

    if (piId) {
      await recordStripePaymentFailed({
        invoiceId,
        amountCents,
        stripePaymentIntentId: piId,
        failureMessage: message,
        customerId: ppc.id,
        stripePaymentMethodId: trimmedPmId,
        pendingPaymentId: pendingRowId,
      });
    } else if (pendingRowId) {
      await recordStripePaymentFailed({
        invoiceId,
        amountCents,
        failureMessage: message,
        customerId: ppc.id,
        stripePaymentMethodId: trimmedPmId,
        pendingPaymentId: pendingRowId,
      });
    }

    if (attached) await detachIfAttached(stripe, trimmedPmId);
    return { ok: false, status: "failed", message, paymentIntentId: piId };
  }
}

/** Finalize a phone-entered card charge after client-side 3DS (idempotent with webhook). */
export async function finalizeNewCardCharge(
  invoiceId: string,
  paymentIntentId: string,
  staffUserId: string | null
): Promise<ChargeNewCardResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: "failed", message: "Stripe is not configured." };
  }

  const trimmedPiId = (paymentIntentId ?? "").trim();
  if (!trimmedPiId) {
    return { ok: false, status: "failed", message: "Missing payment intent." };
  }

  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) return { ok: false, status: "failed", message: "Invoice not found." };
  if (!invoice.contact_id) {
    return { ok: false, status: "failed", message: "Invoice has no linked contact." };
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(trimmedPiId);
  } catch {
    return { ok: false, status: "failed", message: "Could not load payment from Stripe." };
  }

  const metaInvoiceId = pi.metadata?.private_pay_invoice_id ?? pi.metadata?.invoice_id;
  if (metaInvoiceId && metaInvoiceId !== invoiceId) {
    return { ok: false, status: "failed", message: "Payment does not match this invoice." };
  }

  if (pi.status === "requires_action" && pi.client_secret) {
    return {
      ok: false,
      status: "requires_action",
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      message: "Additional card verification is still required.",
    };
  }

  if (pi.status !== "succeeded") {
    return {
      ok: false,
      status: "failed",
      message: `Payment did not complete (${pi.status}).`,
      paymentIntentId: pi.id,
    };
  }

  const stripePmId =
    typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
  if (!stripePmId) {
    return { ok: false, status: "failed", message: "Payment method missing on completed charge." };
  }

  const { customer: ppc, stripeCustomerId } = await ensureStripeCustomerForContact(invoice.contact_id, {
    name: invoice.billing_name,
    email: invoice.billing_email,
    phone: invoice.billing_phone,
  });

  const pm = await stripe.paymentMethods.retrieve(stripePmId);
  const existingMethods = await listPaymentMethodsForContact(invoice.contact_id);
  const makeDefault = existingMethods.length === 0;

  const pendingPayment = invoice.payments.find((p) => p.status === "pending" && p.payment_method === "card");
  const pendingPaymentId = pendingPayment?.id ?? null;

  const { invoice: updated, paymentMethods } = await saveCardAndRecordSuccess({
    invoiceId,
    contactId: invoice.contact_id,
    ppcId: ppc.id,
    stripeCustomerId,
    stripePaymentMethodId: stripePmId,
    stripePaymentIntentId: pi.id,
    amountCents: pi.amount_received || pi.amount,
    pendingPaymentId,
    cardBrand: pm.card?.brand ?? null,
    cardLast4: pm.card?.last4 ?? null,
    makeDefault,
  });

  await insertAuditLogTrusted({
    action: "private_pay_card_charged",
    entityType: "private_pay_invoice",
    entityId: invoiceId,
    metadata: {
      invoice_number: invoice.invoice_number,
      amount_cents: pi.amount_received || pi.amount,
      last4: pm.card?.last4 ?? null,
      payment_intent_id: pi.id,
      phone_card_entry: true,
      finalized_after_action: true,
    },
  });

  void staffUserId;

  return {
    ok: true,
    status: "succeeded",
    invoice: updated,
    paymentMethods,
    message: `Card charged and saved ending in ${pm.card?.last4 ?? "****"}.`,
    last4: pm.card?.last4 ?? null,
  };
}
