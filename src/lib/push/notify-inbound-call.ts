import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createRingingCallSessions } from "@/lib/phone/call-sessions";
import { sendFcmDataAndNotificationToDevicesForUsers } from "@/lib/push/send-fcm-to-devices";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveBackupInboundStaffUserIdsAsync, resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";

/**
 * Escalation tier 2: same FCM + `call_sessions` pattern as primary, different title/data type.
 */
export async function notifyInboundBackupCallStaffPush(
  supabase: SupabaseClient,
  input: {
    phoneCallId: string;
    externalCallId: string;
    fromE164?: string | null;
    toE164?: string | null;
  }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_CALL_DISABLED === "1") {
    return;
  }
  try {
    const userIds = await resolveBackupInboundStaffUserIdsAsync();
    if (userIds.length === 0) {
      return;
    }

    const from = (input.fromE164 ?? "").trim() || "unknown";
    const openPath = `/workspace/phone/keypad`;
    const callSid = input.externalCallId.trim();

    const created = await createRingingCallSessions(supabase, {
      callSid,
      phoneCallId: input.phoneCallId.trim(),
      userIds,
      fromE164: input.fromE164 ?? null,
      toE164: input.toE164 ?? null,
    });

    if (!created.ok) {
      console.warn("[push] backup call_sessions create failed", { error: created.error });
    }

    const { data: sessions, error: sesErr } = await supabase
      .from("call_sessions")
      .select("id, user_id")
      .eq("call_sid", callSid)
      .in("user_id", userIds);

    if (sesErr) {
      console.warn("[push] backup call_sessions load:", sesErr.message);
    }

    const rows = sessions ?? [];
    for (const row of rows) {
      const uid = typeof row.user_id === "string" ? row.user_id : null;
      const sessionId = typeof row.id === "string" ? row.id : null;
      if (!uid || !sessionId) continue;

      const { data: anyDevice } = await supabase
        .from("devices")
        .select("id")
        .eq("user_id", uid)
        .eq("is_active", true)
        .not("fcm_token", "is", null)
        .limit(1)
        .maybeSingle();

      const hasDevices = Boolean(anyDevice);

      const payload = {
        title: "Incoming call (backup)",
        body: from,
        data: {
          type: "incoming_call_backup",
          phone_call_id: input.phoneCallId.trim(),
          call_sid: callSid,
          call_session_id: sessionId,
          open_path: openPath,
          from_e164: from,
        },
        apnsCollapseId: `call-backup-${callSid}`,
      };

      if (hasDevices) {
        const result = await sendFcmDataAndNotificationToDevicesForUsers(supabase, [uid], payload);
        if (!result.ok) {
          console.warn("[push] inbound backup devices notify failed", { error: result.error });
        }
      } else {
        const legacy = await sendFcmDataAndNotificationToUserIds(supabase, [uid], payload);
        if (!legacy.ok) {
          console.warn("[push] inbound backup legacy notify failed", { error: legacy.error });
        }
      }
    }
  } catch (e) {
    console.warn("[push] inbound backup call notify:", e);
  }
}

/**
 * High-priority alert when a PSTN inbound hits the Twilio ring path.
 * - Creates `call_sessions` rows (one per user) for Realtime multi-device sync.
 * - Sends FCM per user with that user's `call_session_id` (Dialpad-style).
 * - Falls back to legacy `user_push_devices` when no `devices` row has FCM.
 */
export async function notifyInboundCallStaffPush(
  supabase: SupabaseClient,
  input: {
    phoneCallId: string;
    externalCallId: string;
    fromE164?: string | null;
    toE164?: string | null;
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
    const callSid = input.externalCallId.trim();

    const created = await createRingingCallSessions(supabase, {
      callSid,
      phoneCallId: input.phoneCallId.trim(),
      userIds,
      fromE164: input.fromE164 ?? null,
      toE164: input.toE164 ?? null,
    });

    if (!created.ok) {
      console.warn("[push] call_sessions create failed", { error: created.error });
    }

    const { data: sessions, error: sesErr } = await supabase
      .from("call_sessions")
      .select("id, user_id")
      .eq("call_sid", callSid)
      .in("user_id", userIds);

    if (sesErr) {
      console.warn("[push] call_sessions load after create:", sesErr.message);
    }

    const rows = sessions ?? [];
    for (const row of rows) {
      const uid = typeof row.user_id === "string" ? row.user_id : null;
      const sessionId = typeof row.id === "string" ? row.id : null;
      if (!uid || !sessionId) continue;

      const { data: anyDevice } = await supabase
        .from("devices")
        .select("id")
        .eq("user_id", uid)
        .eq("is_active", true)
        .not("fcm_token", "is", null)
        .limit(1)
        .maybeSingle();

      const hasDevices = Boolean(anyDevice);

      /** iOS: VoIP + CallKit (Agent 1). FCM here is for Android / data sync; optional via env. */
      if (process.env.SAINTLY_PUSH_INBOUND_CALL_FCM_DISABLED === "1") {
        continue;
      }

      const payload = {
        title: "Incoming call",
        body: from,
        data: {
          type: "incoming_call",
          phone_call_id: input.phoneCallId.trim(),
          call_sid: callSid,
          call_session_id: sessionId,
          open_path: openPath,
          from_e164: from,
        },
        apnsCollapseId: `call-${callSid}`,
      };

      if (hasDevices) {
        const result = await sendFcmDataAndNotificationToDevicesForUsers(supabase, [uid], payload);
        if (!result.ok) {
          console.warn("[push] inbound call devices notify failed", { error: result.error });
        } else {
          console.log("[push] inbound call devices notify", {
            userId: uid,
            sent: result.sent,
            failureCount: result.failureCount,
          });
        }
      } else {
        const legacy = await sendFcmDataAndNotificationToUserIds(supabase, [uid], payload);
        if (!legacy.ok) {
          console.warn("[push] inbound call legacy notify failed", { error: legacy.error });
        } else {
          console.log("[push] inbound call user_push_devices (no devices row)", {
            userId: uid,
            sent: legacy.sent,
          });
        }
      }
    }
  } catch (e) {
    console.warn("[push] inbound call notify:", e);
  }
}
