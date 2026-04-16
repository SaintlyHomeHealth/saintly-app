import "server-only";

import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getFirebaseAdminApp } from "@/lib/push/firebase-admin-app";

export type FcmSendResult = { ok: true; sent: number } | { ok: false; error: string };

async function deleteInvalidTokens(supabase: SupabaseClient, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabase.from("user_push_devices").delete().in("fcm_token", tokens);
  if (error) {
    console.warn("[push] delete invalid FCM tokens:", error.message);
  }
}

/**
 * Sends FCM to all registered devices for the given users (best-effort).
 */
export async function sendFcmDataAndNotificationToUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  input: {
    title: string;
    body: string;
    data: Record<string, string>;
  }
): Promise<FcmSendResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return { ok: false, error: "missing FIREBASE_SERVICE_ACCOUNT_JSON" };
  }
  const uniqueUsers = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUsers.length === 0) {
    return { ok: true, sent: 0 };
  }

  const { data: rows, error } = await supabase
    .from("user_push_devices")
    .select("fcm_token")
    .in("user_id", uniqueUsers);

  if (error) {
    console.warn("[push] load user_push_devices:", error.message);
    return { ok: false, error: error.message };
  }

  const tokens = [...new Set((rows ?? []).map((r) => r.fcm_token as string).filter(Boolean))];
  if (tokens.length === 0) {
    return { ok: true, sent: 0 };
  }

  const messaging = getMessaging(app);
  const dataPayload: Record<string, string> = { ...input.data };

  let sent = 0;
  const invalid: string[] = [];

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
          console.warn("[push] FCM send error:", code, r.error?.message);
        }
      }
    });
  }

  if (invalid.length > 0) {
    await deleteInvalidTokens(supabase, invalid);
  }

  return { ok: true, sent };
}
