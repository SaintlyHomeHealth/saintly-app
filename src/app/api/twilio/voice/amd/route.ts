import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioAmdStatusCallback } from "@/lib/phone/log-call";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Twilio <Number amdStatusCallback> for the forwarded PSTN leg.
 * Twilio does not use the HTTP response body to change an in-progress <Dial>; detection results
 * are applied via Dial end state (e.g. DialBridged) and dial-result. This route logs AMD for ops/debug.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const parentSid = params.ParentCallSid?.trim();
  const answeredBy = params.AnsweredBy?.trim() ?? null;
  const childSid = params.CallSid?.trim() ?? null;
  const durationMs = parseOptionalPositiveInt(params.MachineDetectionDuration);

  if (!parentSid) {
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const result = await applyTwilioAmdStatusCallback(supabaseAdmin, {
    parentCallSid: parentSid,
    answeredBy,
    childCallSid: childSid,
    machineDetectionDurationMs: durationMs,
    raw: params,
  });

  if (!result.ok) {
    console.warn("[twilio/voice/amd]", result.error);
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
