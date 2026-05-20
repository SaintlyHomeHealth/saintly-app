import { NextRequest, NextResponse } from "next/server";

import {
  clientCallSidFromConferenceFriendlyName,
  escapeXml,
} from "@/lib/twilio/softphone-conference";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * TwiML fallback if confirm route is bypassed — joins conference with staff_cell label.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { room: rawRoom } = await ctx.params;
  const room = decodeURIComponent(rawRoom || "").trim();
  const pstnCallSid = typeof parsed.params.CallSid === "string" ? parsed.params.CallSid.trim() : null;
  const clientFromRoom = clientCallSidFromConferenceFriendlyName(room);

  if (!room || !room.startsWith("sf-")) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const statusAttr = publicBase
    ? ` statusCallback="${escapeXml(`${publicBase}/api/twilio/voice/softphone-conference-events`)}" statusCallbackMethod="POST" statusCallbackEvent="join leave mute hold"`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="staff_cell"${statusAttr}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/active-call/move-to-cell/join/[room]",
    client_call_sid: clientFromRoom,
    pstn_call_sid: pstnCallSid,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "move_to_cell_staff_cell_join",
    parent_call_sid: null,
    from_raw: typeof parsed.params.From === "string" ? parsed.params.From : null,
    to_raw: typeof parsed.params.To === "string" ? parsed.params.To : null,
  });

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
