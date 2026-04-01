import { NextRequest } from "next/server";

/**
 * URL Twilio used when signing webhooks. Prefer TWILIO_WEBHOOK_BASE_URL (origin only) so
 * /api/twilio/voice, /api/twilio/voice/status, /api/twilio/voice/dial-result, and
 * /api/twilio/voice/recording all validate. Legacy TWILIO_WEBHOOK_SIGNATURE_URL may be a full URL
 * to any Twilio route; only its origin is reused with the current pathname.
 */
export function getTwilioWebhookSignatureUrl(req: NextRequest): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  if (base) {
    return `${base}${req.nextUrl.pathname}`;
  }

  const legacyFull = process.env.TWILIO_WEBHOOK_SIGNATURE_URL?.trim();
  if (legacyFull) {
    try {
      const u = new URL(legacyFull);
      return `${u.origin}${req.nextUrl.pathname}`;
    } catch {
      /* fall through */
    }
  }

  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim() ||
    "";
  const proto =
    (req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "")) ||
    "https";
  return `${proto}://${host}${req.nextUrl.pathname}`;
}
