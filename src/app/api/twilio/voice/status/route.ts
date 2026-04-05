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

function shortSid(s: string | undefined | null): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim();
  return t.length > 10 ? `${t.slice(0, 8)}…${t.slice(-6)}` : t;
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
      console.warn("[twilio/voice/status] signature_rejected", {
        signature_url_used: url,
        request_host:
          req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host"),
        has_signature_header: Boolean(signature),
        twilio_public_base_set: Boolean(process.env.TWILIO_PUBLIC_BASE_URL?.trim()),
        twilio_webhook_base_set: Boolean(process.env.TWILIO_WEBHOOK_BASE_URL?.trim()),
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (authToken) {
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      console.warn("[twilio/voice/status] signature_rejected", {
        signature_url_used: url,
        request_host:
          req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host"),
        has_signature_header: Boolean(signature),
        twilio_public_base_set: Boolean(process.env.TWILIO_PUBLIC_BASE_URL?.trim()),
        twilio_webhook_base_set: Boolean(process.env.TWILIO_WEBHOOK_BASE_URL?.trim()),
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const callStatus = params.CallStatus?.trim();
  /** Dial callbacks use child CallSid; our DB keys the inbound/parent leg. */
  const externalCallId = params.ParentCallSid?.trim() || params.CallSid?.trim();

  console.log("[twilio/voice/status] hit", {
    normalized_external_call_id: shortSid(externalCallId),
    raw_call_sid: shortSid(params.CallSid),
    raw_parent_call_sid: shortSid(params.ParentCallSid),
    call_status: callStatus ?? null,
    dial_call_status: params.DialCallStatus?.trim() ?? null,
    direction: params.Direction?.trim() ?? null,
  });

  if (!externalCallId || !callStatus) {
    console.warn("[twilio/voice/status] noop_missing_fields", {
      has_external_call_id: Boolean(externalCallId),
      has_call_status: Boolean(callStatus),
      raw_call_sid: shortSid(params.CallSid),
      raw_parent_call_sid: shortSid(params.ParentCallSid),
    });
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
    console.error("[twilio/voice/status] apply_failed", {
      error: result.error,
      normalized_external_call_id: shortSid(externalCallId),
      raw_call_sid: shortSid(params.CallSid),
      raw_parent_call_sid: shortSid(params.ParentCallSid),
    });
  } else {
    console.log("[twilio/voice/status] applied", {
      phone_calls_id: result.callId,
      normalized_external_call_id: shortSid(externalCallId),
    });
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
