"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

/** Load Stripe.js with the publishable key (client-side only). */
export function getStripeJs(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

export function isStripePublishableKeyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
}
