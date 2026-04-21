import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyInboundTwilioSms } from "@/lib/phone/inbound-sms-webhook";
import { getTwilioWebhookSignatureUrl } from "@/lib/twilio/signature-url";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Messaging inbound webhook. Configure in Twilio Console → Messaging → A MESSAGE COMES IN.
 * Twilio expects HTTP 200 with TwiML (XML); plain text/JSON errors can cause webhook failures or odd behavior.
 */
const TWIML_EMPTY_OK = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function twimlOkResponse(): NextResponse {
  return new NextResponse(TWIML_EMPTY_OK, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest) {
  const route = "/api/twilio/sms/inbound";
  const startedAt = new Date().toISOString();
  console.log("[sms-inbound] route_start", { route, startedAt });

  try {
    const parsed = await parseVerifiedTwilioFormBody(req);
    if (!parsed.ok) {
      /** Root cause note: 403/503 from verification was previously returned to Twilio as non-TwiML, breaking the webhook. */
      console.warn("[sms-inbound] preprocess_failed_returning_twiml_200", {
        route,
        startedAt,
        signatureUrlUsedForValidation: getTwilioWebhookSignatureUrl(req),
        hint:
          "Twilio must POST with valid X-Twilio-Signature. Set TWILIO_WEBHOOK_BASE_URL to the exact public origin Twilio uses (e.g. https://your-app.vercel.app). TWILIO_AUTH_TOKEN must match the Twilio account.",
      });
      console.log("[sms-inbound] final_response", { route, kind: "twiml_empty_ok_after_preprocess_fail" });
      return twimlOkResponse();
    }

    const p = parsed.params;
    const messageSid = (p.MessageSid ?? p.SmsSid ?? "").trim();
    const from = (p.From ?? "").trim();
    const to = (p.To ?? "").trim();
    const body = typeof p.Body === "string" ? p.Body : "";

    console.log("[sms-inbound] parsed_inbound_fields", {
      route,
      messageSid: messageSid || "(missing)",
      from: from || "(missing)",
      to: to || "(missing)",
      bodyLen: body.length,
      hasAccountSid: Boolean(p.AccountSid),
      hasSmsSid: Boolean(p.SmsSid),
      hasMessageSid: Boolean(p.MessageSid),
    });

    console.log("[sms-inbound] applyInboundTwilioSms_start", { route, messageSid: messageSid || null });
    const result = await applyInboundTwilioSms(supabaseAdmin, p);
    console.log("[sms-inbound] applyInboundTwilioSms_end", {
      route,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error }),
    });

    if (!result.ok) {
      console.warn("[sms-inbound] persist_failed_still_returning_twiml", {
        route,
        error: result.error,
        messageSid: messageSid || null,
        from,
        to,
      });
    }

    console.log("[sms-inbound] final_response", { route, kind: "twiml_empty_ok" });
    return twimlOkResponse();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[sms-inbound] POST_unhandled_exception", {
      route,
      startedAt,
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    console.log("[sms-inbound] final_response", { route, kind: "twiml_empty_ok_after_exception" });
    return twimlOkResponse();
  }
}
