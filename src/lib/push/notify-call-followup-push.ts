import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";

const LOG = "[push] call-followup";

/**
 * Same audience as inbound browser ring / inbound SMS fan-out (env + eligible staff_profiles).
 */
export async function notifyMissedCallPush(
  supabase: SupabaseClient,
  input: { phoneCallId: string; fromE164?: string | null }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_MISSED_CALL_DISABLED === "1") {
    console.log(LOG, "missed skipped", { reason: "SAINTLY_PUSH_MISSED_CALL_DISABLED" });
    return;
  }
  try {
    const userIds = await resolveInboundBrowserStaffUserIdsAsync();
    if (userIds.length === 0) {
      console.log(LOG, "missed skipped", { reason: "no_recipient_user_ids", phoneCallId: input.phoneCallId.trim() });
      return;
    }
    const from = (input.fromE164 ?? "").trim() || "Unknown caller";
    const openPath = "/workspace/phone/calls#workspace-calls-missed-heading";
    const pid = input.phoneCallId.trim();
    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "Missed call",
      body: `Missed call from ${from}`,
      data: {
        type: "missed_call",
        phone_call_id: pid,
        open_path: openPath,
        from_e164: from,
      },
      apnsCollapseId: `missed-${pid}`,
    });
    if (!result.ok) {
      console.warn(LOG, "missed notify failed", { error: result.error, phoneCallId: input.phoneCallId.trim() });
    } else {
      console.log(LOG, "missed notify complete", {
        phoneCallId: input.phoneCallId.trim(),
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn(LOG, "missed notify exception", e);
  }
}

export async function notifyVoicemailPush(
  supabase: SupabaseClient,
  input: { phoneCallId: string; fromE164?: string | null; durationSeconds?: number | null }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_VOICEMAIL_DISABLED === "1") {
    console.log(LOG, "voicemail skipped", { reason: "SAINTLY_PUSH_VOICEMAIL_DISABLED" });
    return;
  }
  try {
    const userIds = await resolveInboundBrowserStaffUserIdsAsync();
    if (userIds.length === 0) {
      console.log(LOG, "voicemail skipped", { reason: "no_recipient_user_ids", phoneCallId: input.phoneCallId.trim() });
      return;
    }
    const from = (input.fromE164 ?? "").trim() || "Unknown caller";
    const dur = input.durationSeconds;
    const durPart =
      typeof dur === "number" && Number.isFinite(dur) && dur > 0 ? ` · ${Math.round(dur)}s` : "";
    const openPath = "/workspace/phone/voicemail";
    const pid = input.phoneCallId.trim();
    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "New voicemail",
      body: `${from}${durPart}`,
      data: {
        type: "voicemail",
        phone_call_id: pid,
        open_path: openPath,
        from_e164: from,
        ...(typeof dur === "number" && Number.isFinite(dur) && dur > 0
          ? { duration_seconds: String(Math.round(dur)) }
          : {}),
      },
      apnsCollapseId: `vm-${pid}`,
    });
    if (!result.ok) {
      console.warn(LOG, "voicemail notify failed", { error: result.error, phoneCallId: input.phoneCallId.trim() });
    } else {
      console.log(LOG, "voicemail notify complete", {
        phoneCallId: input.phoneCallId.trim(),
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn(LOG, "voicemail notify exception", e);
  }
}
