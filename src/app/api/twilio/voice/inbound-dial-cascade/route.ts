import { NextRequest, NextResponse } from "next/server";

import { handleInboundDialCascadePost } from "@/lib/phone/twilio-inbound-dial-cascade";
import { resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Multi-step inbound &lt;Dial action&gt; — advances browser → PSTN → voicemail using `voice_call_sessions.routing_json`.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params as Record<string, string | undefined>;
  const callSid = params.CallSid?.trim();
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : null;

  const publicBase = resolveTwilioVoicePublicBase();
  const xml = await handleInboundDialCascadePost({ params, publicBase });

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/inbound-dial-cascade",
    client_call_sid: callSid ?? null,
    pstn_call_sid: null,
    ai_path_entered: false,
    softphone_bypass_path_entered: false,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "cascade_advance",
    parent_call_sid: parentCallSid,
    from_raw: params.From,
    to_raw: params.To,
  });

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
