import type Stripe from "stripe";

export function friendlyStripeError(error: Stripe.errors.StripeError | Error): string {
  if ("code" in error && error.code === "authentication_required") {
    return "Card authentication required — ask the client to complete verification or send a payment link.";
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
