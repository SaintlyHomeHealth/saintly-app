import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

function secretsEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Shared secret for inbound email HTTP POST (Resend/SendGrid/Mailgun forwarders).
 * Headers tried: `x-inbound-email-secret`, `x-webhook-secret`, `Authorization: Bearer …`.
 * When unset: non-production only (local curl). Production requires a non-empty secret.
 */
export function verifyInboundEmailSharedSecret(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expectedRaw = process.env.INBOUND_EMAIL_SHARED_SECRET;
  const expected = expectedRaw?.trim() ?? "";

  if (process.env.NODE_ENV === "production") {
    if (!expected) {
      console.warn("[inbound-email] INBOUND_EMAIL_SHARED_SECRET missing in production");
      return { ok: false, reason: "misconfigured" };
    }
  } else if (!expected) {
    return { ok: true };
  }

  const headerSecret =
    req.headers.get("x-inbound-email-secret")?.trim() ||
    req.headers.get("x-webhook-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!headerSecret || !secretsEqual(headerSecret, expected)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}
