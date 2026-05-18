import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioVoiceStatusCallback } from "@/lib/phone/log-call";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "outbound-pstn-bridge";

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

/**
 * Staff-leg lifecycle (ringing / answered / completed / busy / no-answer).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const callSid = p.CallSid?.trim() ?? null;
  const callStatusRaw = (p.CallStatus ?? "").trim().toLowerCase();

  const milestone =
    callStatusRaw === "initiated"
      ? "twilio_staff_leg_initiated"
      : callStatusRaw === "ringing"
        ? "staff_pstn_ringing"
        : callStatusRaw === "in-progress"
          ? "staff_leg_in_progress"
          : callStatusRaw === "completed"
            ? "staff_leg_completed"
            : callStatusRaw === "busy" || callStatusRaw === "no-answer"
              ? "call_failed_no_answer"
              : "twilio_status";

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: milestone,
      call_sid: callSid,
      call_status: callStatusRaw || null,
      duration: p.CallDuration ?? p.Duration ?? null,
    })
  );

  const callStatusNorm = (p.CallStatus ?? "").trim();
  if (callSid && callStatusNorm) {
    const result = await applyTwilioVoiceStatusCallback(supabaseAdmin, {
      CallSid: callSid,
      CallStatus: callStatusNorm,
      DialCallStatus: p.DialCallStatus?.trim() || null,
      AnsweredBy: p.AnsweredBy?.trim() || null,
      From: p.From?.trim() ?? null,
      To: p.To?.trim() ?? null,
      DurationSeconds: parseTwilioDurationSeconds(p),
      raw: p,
    });
    if (!result.ok) {
      console.warn(`[${LOG_TAG}] apply_status_failed`, { error: result.error, call_sid: callSid });
    }
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
