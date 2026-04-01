import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioVoiceStatusCallback } from "@/lib/phone/log-call";
import { getTwilioWebhookSignatureUrl } from "@/lib/twilio/signature-url";
import { validateTwilioWebhookSignature } from "@/lib/twilio/validate-signature";

function formDataToStringRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/** Twilio may send Duration, CallDuration, or DialCallDuration depending on callback type. */
function parseTwilioDurationSeconds(params: Record<string, string>): number | null {
  for (const key of ["CallDuration", "Duration", "DialCallDuration"]) {
    const v = params[key];
    if (v != null && v !== "") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) {
        return n;
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const params = formDataToStringRecord(formData);

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = req.headers.get("X-Twilio-Signature") ?? req.headers.get("x-twilio-signature");

  if (process.env.NODE_ENV === "production") {
    if (!authToken) {
      return new NextResponse("Service unavailable", { status: 503 });
    }
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (authToken) {
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const callStatus = params.CallStatus?.trim();
  /** Dial callbacks use child CallSid; our DB keys the inbound/parent leg. */
  const externalCallId = params.ParentCallSid?.trim() || params.CallSid?.trim();

  if (!externalCallId || !callStatus) {
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const dialCallStatus = params.DialCallStatus?.trim() || null;
  const durationSeconds = parseTwilioDurationSeconds(params);
  const answeredBy = params.AnsweredBy?.trim() || null;

  const result = await applyTwilioVoiceStatusCallback(supabaseAdmin, {
    CallSid: externalCallId,
    CallStatus: callStatus,
    DialCallStatus: dialCallStatus,
    AnsweredBy: answeredBy,
    From: params.From?.trim() ?? null,
    To: params.To?.trim() ?? null,
    DurationSeconds: durationSeconds,
    raw: params,
  });

  if (!result.ok) {
    console.warn("[twilio/voice/status]", result.error);
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
