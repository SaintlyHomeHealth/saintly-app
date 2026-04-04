import { NextRequest, NextResponse } from "next/server";

import { getTwilioWebhookSignatureUrl } from "@/lib/twilio/signature-url";
import { validateTwilioWebhookSignature } from "@/lib/twilio/validate-signature";

export function formDataToStringRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Parse application/x-www-form-urlencoded body and verify Twilio signature (same rules as voice/status).
 */
export async function parseVerifiedTwilioFormBody(
  req: NextRequest
): Promise<{ ok: true; params: Record<string, string> } | { ok: false; response: NextResponse }> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return { ok: false, response: new NextResponse("Bad Request", { status: 400 }) };
  }

  const params = formDataToStringRecord(formData);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = req.headers.get("X-Twilio-Signature") ?? req.headers.get("x-twilio-signature");

  if (process.env.NODE_ENV === "production") {
    if (!authToken) {
      return { ok: false, response: new NextResponse("Service unavailable", { status: 503 }) };
    }
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      if (req.nextUrl.pathname.includes("/sms")) {
        console.warn("[sms-inbound] signature validation failed", { pathname: req.nextUrl.pathname, url });
      }
      return { ok: false, response: new NextResponse("Forbidden", { status: 403 }) };
    }
  } else if (authToken) {
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      if (req.nextUrl.pathname.includes("/sms")) {
        console.warn("[sms-inbound] signature validation failed", { pathname: req.nextUrl.pathname, url });
      }
      return { ok: false, response: new NextResponse("Forbidden", { status: 403 }) };
    }
  }

  return { ok: true, params };
}
