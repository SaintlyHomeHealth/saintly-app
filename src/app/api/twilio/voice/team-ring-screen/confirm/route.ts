import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { startPstnRealtimeTranscriptionIfEligible } from "@/lib/phone/start-pstn-realtime-transcription";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * After Gather on team ring leg: digit 1 bridges; anything else hangs up so voicemail does not connect business audio.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const digits = (parsed.params.Digits ?? "").trim();
  const callSid = parsed.params.CallSid ?? null;

  if (digits === "1") {
    const parentSid =
      (typeof parsed.params.ParentCallSid === "string" ? parsed.params.ParentCallSid.trim() : "") ||
      (callSid ?? "").trim();
    console.log(
      JSON.stringify({
        tag: "inbound-voice-flow",
        event: "team_ring_press_1_accepted",
        call_sid: callSid,
        parent_call_sid: parentSid.startsWith("CA") ? `${parentSid.slice(0, 10)}…` : parentSid || null,
      })
    );
    if (parentSid.startsWith("CA")) {
      void startPstnRealtimeTranscriptionIfEligible(supabaseAdmin, {
        twilioCallSid: parentSid,
        kind: "inbound_parent",
        logSource: "team_ring_screen_confirm",
      }).catch((e) => {
        console.warn("[team-ring-screen/confirm] start_transcript_unhandled", e instanceof Error ? e.message : e);
      });
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
