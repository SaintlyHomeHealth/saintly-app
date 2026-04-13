import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { readVoiceAiMetadataFromMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";

/**
 * Live caller context for the workspace softphone (AI summary + transcript excerpt).
 * Looks up `phone_calls` by Twilio Call SID (`external_call_id`).
 *
 * Query: `call_sid` — Twilio CallSid on the Client leg (matches `phone_calls.external_call_id`).
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();
  if (!callSid || callSid.length < 10) {
    return NextResponse.json({ error: "call_sid required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .select("id, from_e164, external_call_id, metadata, started_at")
    .eq("external_call_id", callSid)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/call-context]", error.message);
    }
    return NextResponse.json({ found: false }, { status: 200 });
  }

  if (!data) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  const meta = data.metadata;
  const voiceAi = readVoiceAiMetadataFromMetadata(meta);
  const sc =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).softphone_conference
      : null;
  const conf =
    sc && typeof sc === "object" && !Array.isArray(sc)
      ? (sc as Record<string, unknown>)
      : null;

  return NextResponse.json({
    found: true,
    phone_call_id: data.id,
    from_e164: typeof data.from_e164 === "string" ? data.from_e164 : null,
    softphone_conference: conf
      ? {
          conference_sid: typeof conf.conference_sid === "string" ? conf.conference_sid : null,
          pstn_call_sid: typeof conf.pstn_call_sid === "string" ? conf.pstn_call_sid : null,
          pstn_on_hold: typeof conf.pstn_on_hold === "boolean" ? conf.pstn_on_hold : null,
          mode: typeof conf.mode === "string" ? conf.mode : null,
        }
      : null,
    voice_ai: voiceAi
      ? {
          short_summary: voiceAi.short_summary || null,
          urgency: voiceAi.urgency || null,
          route_target: voiceAi.route_target || null,
          caller_category: voiceAi.caller_category || null,
          live_transcript_excerpt: voiceAi.live_transcript_excerpt || null,
          recommended_action: voiceAi.recommended_action || null,
          confidence_summary: voiceAi.confidence_summary || null,
        }
      : null,
  });
}
