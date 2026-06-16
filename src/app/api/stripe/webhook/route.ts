import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { removePaymentMethodByStripeId } from "@/lib/private-pay/customers";
import { handleSetupIntentSucceeded } from "@/lib/private-pay/charge-card";
import { recordStripePaymentFailed, recordStripePaymentSucceeded } from "@/lib/private-pay/data";
import { getStripe, getStripeWebhookSecret } from "@/lib/private-pay/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CardInfo = { brand: string | null; last4: string | null; chargeId: string | null };

async function resolveCardInfo(stripe: Stripe, paymentIntentId: string): Promise<CardInfo> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = (pi.latest_charge ?? null) as Stripe.Charge | null;
    const card = charge?.payment_method_details?.card ?? null;
    return {
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
      chargeId: charge?.id ?? null,
    };
  } catch {
    return { brand: null, last4: null, chargeId: null };
  }
}

async function handlePaidIntent(
  stripe: Stripe,
  opts: {
    invoiceId: string | undefined | null;
    paymentIntentId: string;
    amountCents: number;
    customerId: string | null;
    sessionId: string | null;
    stripePaymentMethodId?: string | null;
    privatePayCustomerId?: string | null;
  }
): Promise<void> {
  if (!opts.invoiceId) {
    console.warn("[stripe webhook] missing private_pay_invoice_id metadata", opts.paymentIntentId);
    return;
  }
  const card = await resolveCardInfo(stripe, opts.paymentIntentId);
  await recordStripePaymentSucceeded({
    invoiceId: opts.invoiceId,
    amountCents: opts.amountCents,
    stripePaymentIntentId: opts.paymentIntentId,
    stripeChargeId: card.chargeId,
    stripeCustomerId: opts.customerId,
    stripeCheckoutSessionId: opts.sessionId,
    cardBrand: card.brand,
    cardLast4: card.last4,
    customerId: opts.privatePayCustomerId ?? null,
    stripePaymentMethodId: opts.stripePaymentMethodId ?? null,
  });
}

async function handleFailedIntent(
  opts: {
    invoiceId: string | undefined | null;
    paymentIntentId: string;
    amountCents: number;
    failureMessage: string;
    privatePayCustomerId?: string | null;
    stripePaymentMethodId?: string | null;
  }
): Promise<void> {
  if (!opts.invoiceId) return;
  await recordStripePaymentFailed({
    invoiceId: opts.invoiceId,
    amountCents: opts.amountCents,
    stripePaymentIntentId: opts.paymentIntentId,
    failureMessage: opts.failureMessage,
    customerId: opts.privatePayCustomerId ?? null,
    stripePaymentMethodId: opts.stripePaymentMethodId ?? null,
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = getStripeWebhookSecret();
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)" },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    console.warn("[stripe webhook] signature verification failed", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "setup" && session.setup_intent) {
        const setupIntentId =
          typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent.id;
        await handleSetupIntentSucceeded(setupIntentId);
      } else if (session.payment_status === "paid" && typeof session.payment_intent === "string") {
        await handlePaidIntent(stripe, {
          invoiceId: session.metadata?.private_pay_invoice_id ?? session.client_reference_id,
          paymentIntentId: session.payment_intent,
          amountCents: session.amount_total ?? 0,
          customerId: typeof session.customer === "string" ? session.customer : null,
          sessionId: session.id,
        });
      }
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
      await handlePaidIntent(stripe, {
        invoiceId: pi.metadata?.private_pay_invoice_id ?? pi.metadata?.invoice_id,
        paymentIntentId: pi.id,
        amountCents: pi.amount_received || pi.amount,
        customerId: typeof pi.customer === "string" ? pi.customer : null,
        sessionId: null,
        stripePaymentMethodId: pmId,
        privatePayCustomerId: pi.metadata?.customer_id ?? null,
      });
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
      const message = pi.last_payment_error?.message ?? "Payment failed";
      await handleFailedIntent({
        invoiceId: pi.metadata?.private_pay_invoice_id ?? pi.metadata?.invoice_id,
        paymentIntentId: pi.id,
        amountCents: pi.amount,
        failureMessage: message,
        privatePayCustomerId: pi.metadata?.customer_id ?? null,
        stripePaymentMethodId: pmId,
      });
    } else if (event.type === "setup_intent.succeeded") {
      const si = event.data.object as Stripe.SetupIntent;
      await handleSetupIntentSucceeded(si.id);
    } else if (event.type === "payment_method.detached") {
      const pm = event.data.object as Stripe.PaymentMethod;
      await removePaymentMethodByStripeId(pm.id);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler error";
    console.error("[stripe webhook] handler error", message);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
