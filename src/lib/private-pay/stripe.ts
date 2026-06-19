import "server-only";

import Stripe from "stripe";

let cached: Stripe | null | undefined;

/** Returns a configured Stripe client, or null when STRIPE_SECRET_KEY is not set. */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return cached;
  }
  // Omit apiVersion so the SDK uses its pinned default / account default.
  cached = new Stripe(key, { appInfo: { name: "saintly-private-pay" } });
  return cached;
}

/** True when STRIPE_SECRET_KEY is set, i.e. card payments can be processed. */
export function isPrivatePayStripeConfigured(): boolean {
  return getStripe() !== null;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}
