import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhoneCallStatus } from "@/lib/phone/log-call";

function isTerminalPhoneStatus(status: PhoneCallStatus): boolean {
  return (
    status === "completed" ||
    status === "missed" ||
    status === "abandoned" ||
    status === "failed" ||
    status === "cancelled"
  );
}

/**
 * Idempotent: one alert per Twilio parent CallSid (external_call_id).
 */
export async function ensureIncomingCallAlert(
  supabase: SupabaseClient,
  input: {
    phone_call_id: string;
    external_call_id: string;
    from_e164: string | null;
    to_e164: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("incoming_call_alerts").insert({
    phone_call_id: input.phone_call_id,
    external_call_id: input.external_call_id,
    from_e164: input.from_e164,
    to_e164: input.to_e164,
    status: "new",
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Keeps alerts in sync with phone_calls.status from Twilio status callbacks.
 * - Answered (in_progress): auto-acknowledge if still new.
 * - Terminal: resolve.
 */
export async function syncIncomingCallAlertFromPhoneStatus(
  supabase: SupabaseClient,
  phoneCallId: string,
  mapped: PhoneCallStatus
): Promise<void> {
  if (mapped === "in_progress") {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("incoming_call_alerts")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
      })
      .eq("phone_call_id", phoneCallId)
      .eq("status", "new");

    if (error) {
      console.warn("[incoming_call_alerts] acknowledge on answer:", error.message);
    }
    return;
  }

  if (isTerminalPhoneStatus(mapped)) {
    await resolveIncomingCallAlertIfNeeded(supabase, phoneCallId);
  }
}

/**
 * Ensures the alert is closed (e.g. voicemail recording finalized, or safety if status callbacks were delayed).
 */
export async function resolveIncomingCallAlertIfNeeded(
  supabase: SupabaseClient,
  phoneCallId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("incoming_call_alerts")
    .update({
      status: "resolved",
      resolved_at: now,
    })
    .eq("phone_call_id", phoneCallId)
    .neq("status", "resolved");

  if (error) {
    console.warn("[incoming_call_alerts] resolve:", error.message);
  }
}
