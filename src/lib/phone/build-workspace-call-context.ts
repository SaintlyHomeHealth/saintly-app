import type { SupabaseClient } from "@supabase/supabase-js";

import { readVoiceAiMetadataFromMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";
import { computeConferenceGating, type ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";

export type WorkspaceCallContextPayload = {
  phone_call_id: string;
  from_e164: string | null;
  external_call_id: string;
  softphone_conference: {
    conference_sid: string | null;
    pstn_call_sid: string | null;
    pstn_on_hold: boolean | null;
    mode: string | null;
  } | null;
  voice_ai: {
    short_summary: string | null;
    urgency: string | null;
    route_target: string | null;
    caller_category: string | null;
    live_transcript_excerpt: string | null;
    recommended_action: string | null;
    confidence_summary: string | null;
  } | null;
  conference_gating: ConferenceGatingSnapshot;
};

/**
 * Shared payload for `/api/workspace/phone/call-context` and `/api/workspace/phone/conference/diagnostics`.
 */
export async function buildWorkspaceCallContextPayload(
  supabase: SupabaseClient,
  callSid: string
): Promise<{ found: false } | { found: true; payload: WorkspaceCallContextPayload }> {
  const { data, error } = await supabase
    .from("phone_calls")
    .select("id, from_e164, external_call_id, metadata, started_at")
    .eq("external_call_id", callSid)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { found: false };
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

  const softphoneConference = conf
    ? {
        mode: typeof conf.mode === "string" ? conf.mode : null,
        conference_sid: typeof conf.conference_sid === "string" ? conf.conference_sid : null,
        pstn_call_sid: typeof conf.pstn_call_sid === "string" ? conf.pstn_call_sid : null,
      }
    : null;

  const gating = computeConferenceGating({
    clientCallSid: typeof data.external_call_id === "string" ? data.external_call_id : callSid,
    softphoneConference: softphoneConference,
  });

  const payload: WorkspaceCallContextPayload = {
    phone_call_id: data.id as string,
    from_e164: typeof data.from_e164 === "string" ? data.from_e164 : null,
    external_call_id: typeof data.external_call_id === "string" ? data.external_call_id : callSid,
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
    conference_gating: gating,
  };

  return { found: true, payload };
}
