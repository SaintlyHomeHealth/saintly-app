import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";

/**
 * High-priority alert when a PSTN inbound hits the Twilio ring path (parallel to browser softphone ringing).
 * Native CallKit still requires Twilio Voice RN SDK + VoIP push credential on the device.
 */
export async function notifyInboundCallStaffPush(
  supabase: SupabaseClient,
  input: {
    phoneCallId: string;
    externalCallId: string;
    fromE164?: string | null;
  }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_CALL_DISABLED === "1") {
    return;
  }
  try {
    const userIds = await resolveInboundBrowserStaffUserIdsAsync();
    if (userIds.length === 0) {
      return;
    }
    const from = (input.fromE164 ?? "").trim() || "unknown";
    const openPath = `/workspace/phone/keypad`;

    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "Incoming call",
      body: from,
      data: {
        type: "incoming_call",
        phone_call_id: input.phoneCallId.trim(),
        call_sid: input.externalCallId.trim(),
        open_path: openPath,
        from_e164: from,
      },
    });

    if (!result.ok) {
      console.warn("[push] inbound call notify failed", { error: result.error });
    } else {
      console.log("[push] inbound call notify complete", {
        success: true,
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn("[push] inbound call notify:", e);
  }
}
