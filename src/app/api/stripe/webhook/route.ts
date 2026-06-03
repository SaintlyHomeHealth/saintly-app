import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, getStripeWebhookSecret } from "@/lib/private-pay/stripe";
import { recordStripePaymentSucceeded } from "@/lib/private-pay/data";

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
      if (session.payment_status === "paid" && typeof session.payment_intent === "string") {
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
      await handlePaidIntent(stripe, {
        invoiceId: pi.metadata?.private_pay_invoice_id,
        paymentIntentId: pi.id,
        amountCents: pi.amount_received || pi.amount,
        customerId: typeof pi.customer === "string" ? pi.customer : null,
        sessionId: null,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler error";
    console.error("[stripe webhook] handler error", message);
    // Return 500 so Stripe retries the event.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
