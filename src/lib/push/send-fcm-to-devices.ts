import "server-only";

import { randomUUID } from "crypto";

import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getFirebaseAdminApp } from "@/lib/push/firebase-admin-app";

export type FcmDevicesSendResult =
  | {
      ok: true;
      sent: number;
      failureCount: number;
      invalidTokenRemovalCount: number;
      errors: Array<{ code: string; message?: string }>;
    }
  | { ok: false; error: string };

async function deleteInvalidDeviceTokens(supabase: SupabaseClient, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabase.from("devices").delete().in("fcm_token", tokens);
  if (error) {
    console.warn("[push] delete invalid device FCM tokens:", error.message);
  }
}

function resolveApnsCollapseId(raw?: string | null): string {
  const t = (raw ?? "").trim();
  const id = t || randomUUID();
  return id.length > 64 ? id.slice(0, 64) : id;
}

/**
 * FCM to `devices` rows (active + non-null fcm_token). Used for mobile ringing + data sync.
 */
export async function sendFcmDataAndNotificationToDevicesForUsers(
  supabase: SupabaseClient,
  userIds: string[],
  input: {
    title: string;
    body: string;
    data: Record<string, string>;
    apnsCollapseId?: string | null;
    /**
     * When set, only send to `devices` rows whose platform is listed.
     * Incoming-call notifications should omit `ios` so Twilio PushKit + CallKit provide ringing.
     */
    recipientPlatforms?: ("ios" | "android")[];
  }
): Promise<FcmDevicesSendResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    console.warn("[push] FCM devices send skipped", { reason: "firebase_admin_not_initialized" });
    return { ok: false, error: "missing FIREBASE_SERVICE_ACCOUNT_JSON" };
  }

  const uniqueUsers = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUsers.length === 0) {
    return { ok: true, sent: 0, failureCount: 0, invalidTokenRemovalCount: 0, errors: [] };
  }

  let devQuery = supabase
    .from("devices")
    .select("fcm_token")
    .in("user_id", uniqueUsers)
    .eq("is_active", true)
    .not("fcm_token", "is", null);
  if (input.recipientPlatforms?.length) {
    devQuery = devQuery.in("platform", input.recipientPlatforms);
  }
  const { data: rows, error } = await devQuery;

  if (error) {
    console.warn("[push] load devices for FCM:", error.message);
    return { ok: false, error: error.message };
  }

  const tokens = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.fcm_token as string | null)
        .filter((t): t is string => Boolean(t && t.trim()))
    ),
  ];

  if (tokens.length === 0) {
    return { ok: true, sent: 0, failureCount: 0, invalidTokenRemovalCount: 0, errors: [] };
  }

  const messaging = getMessaging(app);
  const dataPayload: Record<string, string> = { ...input.data };
  const apnsCollapseId = resolveApnsCollapseId(input.apnsCollapseId);

  let sent = 0;
  const invalid: string[] = [];
  const errors: Array<{ code: string; message?: string }> = [];

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: input.title,
        body: input.body,
      },
      data: dataPayload,
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
          "apns-collapse-id": apnsCollapseId,
        },
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    sent += res.successCount;

    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        const token = chunk[idx];
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          if (token) invalid.push(token);
        } else {
          const message = r.error?.message;
          errors.push({ code: code || "(unknown)", message });
          console.warn("[push] FCM device send error:", code, message);
        }
      }
    });
  }

  if (invalid.length > 0) {
    await deleteInvalidDeviceTokens(supabase, invalid);
  }

  const failureCount = tokens.length - sent;
  return {
    ok: true,
    sent,
    failureCount,
    invalidTokenRemovalCount: invalid.length,
    errors,
  };
}
