import { NextRequest } from "next/server";

/**
 * Validates Phase 0 webhook requests. Set PHONE_WEBHOOK_SECRET in env and send the same
 * value in header `x-saintly-phone-webhook-secret` (or Authorization: Bearer <secret>).
 * If the secret is unset, only non-production requests are allowed (local development).
 */
export function isPhoneWebhookAuthorized(req: NextRequest): boolean {
  const secret = process.env.PHONE_WEBHOOK_SECRET?.trim();
  const headerSecret =
    req.headers.get("x-saintly-phone-webhook-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (secret && secret.length > 0) {
    return headerSecret.length > 0 && headerSecret === secret;
  }

  return process.env.NODE_ENV !== "production";
}
