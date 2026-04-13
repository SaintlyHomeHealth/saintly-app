import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";
import { escapeXml } from "@/lib/twilio/softphone-conference";

/**
 * TwiML for the outbound REST leg that joins the same conference as the browser Client.
 * Path segment must match the `sf-<ClientCallSid>` room from the softphone conference flow.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { room: rawRoom } = await ctx.params;
  const room = decodeURIComponent(rawRoom || "").trim();
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
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="pstn"${statusAttr}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
