import type { SupabaseClient } from "@supabase/supabase-js";

import { syncCallSessionsFromPhoneStatus } from "@/lib/phone/call-sessions";
import type { VoiceRoutingJsonV1 } from "@/lib/phone/voice-route-plan";

export type VoiceCallSessionState =
  | "ringing"
  | "answered"
  | "declined"
  | "caller_hung_up"
  | "missed"
  | "completed"
  | "unknown";

/**
 * Maps internal `phone_calls.status` to a coarse session state for mobile / escalation.
 */
export function mapPhoneStatusToVoiceSessionState(
  status: import("@/lib/phone/log-call").PhoneCallStatus
): VoiceCallSessionState {
  switch (status) {
    case "ringing":
    case "initiated":
      return "ringing";
    case "in_progress":
      return "answered";
    case "completed":
      return "completed";
    case "missed":
      return "missed";
    case "failed":
    case "cancelled":
    case "abandoned":
      return "caller_hung_up";
    default:
      return "unknown";
  }
}

export async function upsertVoiceCallSessionRinging(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    phoneCallId: string;
    fromE164: string | null;
    toE164: string | null;
    escalationLevel?: number;
    routingJson?: VoiceRoutingJsonV1;
    routeType?: string | null;
    ringGroupId?: string | null;
    afterHours?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) {
    return { ok: false, error: "externalCallId is required" };
  }
  const escalation_level = input.escalationLevel ?? 1;
  const row: Record<string, unknown> = {
    external_call_id,
    phone_call_id: input.phoneCallId,
    state: "ringing",
    from_e164: input.fromE164,
    to_e164: input.toE164,
    escalation_level,
    missed: false,
    updated_at: new Date().toISOString(),
  };
  if (input.routingJson) {
    row.routing_json = input.routingJson;
  }
  if (input.routeType != null) {
    row.route_type = input.routeType;
  }
  if (input.ringGroupId != null) {
    row.ring_group_id = input.ringGroupId;
  }
  if (input.afterHours != null) {
    row.after_hours = input.afterHours;
  }
  const { error } = await supabase.from("voice_call_sessions").upsert(row, { onConflict: "external_call_id" });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateVoiceCallSessionCallbackPriority(
  supabase: SupabaseClient,
  input: { externalCallId: string; callbackPriority: number | null }
): Promise<void> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) return;
  const { error } = await supabase
    .from("voice_call_sessions")
    .update({
      callback_priority: input.callbackPriority,
      updated_at: new Date().toISOString(),
    })
    .eq("external_call_id", external_call_id);
  if (error) {
    console.warn("[voice_call_sessions] callback_priority update failed", { message: error.message, external_call_id });
  }
}

export async function updateVoiceCallSessionRoutingJson(
  supabase: SupabaseClient,
  input: { externalCallId: string; routingJson: VoiceRoutingJsonV1 }
): Promise<void> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) return;
  const { error } = await supabase
    .from("voice_call_sessions")
    .update({
      routing_json: input.routingJson,
      updated_at: new Date().toISOString(),
    })
    .eq("external_call_id", external_call_id);
  if (error) {
    console.warn("[voice_call_sessions] routing_json update failed", { message: error.message, external_call_id });
  }
}

export async function updateVoiceCallSessionEscalation(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    escalationLevel: number;
    forwardedToNumber?: string | null;
  }
): Promise<void> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) return;
  const row: Record<string, unknown> = {
    escalation_level: input.escalationLevel,
    updated_at: new Date().toISOString(),
  };
  if (input.forwardedToNumber != null) {
    row.forwarded_to_number = input.forwardedToNumber.trim() || null;
  }
  const { error } = await supabase.from("voice_call_sessions").update(row).eq("external_call_id", external_call_id);
  if (error) {
    console.warn("[voice_call_sessions] escalation update failed", { message: error.message, external_call_id });
  }
}

export async function updateVoiceCallSessionVoicemailFields(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    voicemailUrl: string | null;
    voicemailDurationSeconds: number | null;
  }
): Promise<void> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) return;
  const { error } = await supabase
    .from("voice_call_sessions")
    .update({
      voicemail_url: input.voicemailUrl,
      voicemail_duration_seconds:
        input.voicemailDurationSeconds != null && input.voicemailDurationSeconds >= 0
          ? Math.round(input.voicemailDurationSeconds)
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("external_call_id", external_call_id);
  if (error) {
    console.warn("[voice_call_sessions] voicemail fields update failed", { message: error.message, external_call_id });
  }
}

export async function incrementVoiceCallSessionCallbackAttemptsByPhoneCallId(
  supabase: SupabaseClient,
  input: { phoneCallId: string }
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const phone_call_id = input.phoneCallId.trim();
  if (!phone_call_id) {
    return { ok: false, error: "phoneCallId is required" };
  }
  const { data, error } = await supabase
    .from("voice_call_sessions")
    .select("id, callback_attempt_count")
    .eq("phone_call_id", phone_call_id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: true, count: 0 };
  }
  const prev = typeof data.callback_attempt_count === "number" ? data.callback_attempt_count : 0;
  const next = prev + 1;
  const { error: upErr } = await supabase
    .from("voice_call_sessions")
    .update({ callback_attempt_count: next, updated_at: new Date().toISOString() })
    .eq("phone_call_id", phone_call_id);
  if (upErr) {
    return { ok: false, error: upErr.message };
  }
  return { ok: true, count: next };
}

export async function syncVoiceCallSessionFromPhoneStatus(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    phoneCallId: string;
    finalStatus: import("@/lib/phone/log-call").PhoneCallStatus;
    fromE164: string | null;
    toE164: string | null;
  }
): Promise<void> {
  const external_call_id = input.externalCallId.trim();
  if (!external_call_id) return;

  const state = mapPhoneStatusToVoiceSessionState(input.finalStatus);

  const missedFlag = state === "missed";

  const { error } = await supabase.from("voice_call_sessions").upsert(
    {
      external_call_id,
      phone_call_id: input.phoneCallId,
      state,
      from_e164: input.fromE164,
      to_e164: input.toE164,
      missed: missedFlag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "external_call_id" }
  );

  if (error) {
    console.warn("[voice_call_sessions] upsert failed", { message: error.message, external_call_id });
  }

  await syncCallSessionsFromPhoneStatus(supabase, {
    externalCallId: input.externalCallId,
    mapped: input.finalStatus,
  });
}
