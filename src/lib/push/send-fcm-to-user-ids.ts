import "server-only";

import { randomUUID } from "crypto";

import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildApnsAlertConfig } from "@/lib/push/fcm-apns-alert";
import { getFirebaseAdminApp } from "@/lib/push/firebase-admin-app";

export type FcmSendResult =
  | {
      ok: true;
      sent: number;
      failureCount: number;
      invalidTokenRemovalCount: number;
      errors: Array<{ code: string; message?: string }>;
    }
  | { ok: false; error: string };

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
function resolveApnsCollapseId(raw?: string | null): string {
  const t = (raw ?? "").trim();
  const id = t || randomUUID();
  return id.length > 64 ? id.slice(0, 64) : id;
}

export async function sendFcmDataAndNotificationToUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  input: {
    title: string;
    body: string;
    data: Record<string, string>;
    /**
     * APNs `apns-collapse-id` (max 64 bytes). Unique per logical notification so rapid
     * successive alerts are not replaced/coalesced on-device. Omit to use a random id per send.
     */
    apnsCollapseId?: string | null;
    /**
     * When set, only send to devices whose `user_push_devices.platform` is in this list.
     * Used to avoid iOS alert pushes for incoming calls when Twilio VoIP + CallKit handle ringing.
     */
    recipientPlatforms?: ("ios" | "android")[];
  }
): Promise<FcmSendResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    console.warn("[push] FCM send skipped", { reason: "firebase_admin_not_initialized" });
    return { ok: false, error: "missing FIREBASE_SERVICE_ACCOUNT_JSON" };
  }
  const timing = process.env.SMS_PUSH_TIMING === "1";
  const logFcmPayload =
    process.env.SAINTLY_LOG_FCM_PAYLOAD === "1" || process.env.SMS_PUSH_TIMING === "1";
  const pushTiming = (phase: string, detail?: Record<string, unknown>) => {
    if (!timing) return;
    console.log("[PUSH]", phase, Date.now(), detail ?? {});
  };

  const uniqueUsers = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUsers.length === 0) {
    const empty: FcmSendResult = {
      ok: true,
      sent: 0,
      failureCount: 0,
      invalidTokenRemovalCount: 0,
      errors: [],
    };
    console.log("[push] FCM send result", { ...empty, reason: "no_recipient_user_ids" });
    return empty;
  }

  pushTiming("fcm_before_load_tokens", { recipientUserCount: uniqueUsers.length, title: input.title });
  let tokenQuery = supabase.from("user_push_devices").select("fcm_token, platform").in("user_id", uniqueUsers);
  if (input.recipientPlatforms?.length) {
    tokenQuery = tokenQuery.in("platform", input.recipientPlatforms);
  }
  const { data: rows, error } = await tokenQuery;
  pushTiming("fcm_after_load_tokens", { rowCount: (rows ?? []).length });

  if (error) {
    console.warn("[push] load user_push_devices:", error.message);
    return { ok: false, error: error.message };
  }

  const androidTokens: string[] = [];
  const iosTokens: string[] = [];
  for (const r of rows ?? []) {
    const t = typeof r.fcm_token === "string" ? r.fcm_token.trim() : "";
    if (!t) continue;
    const p = typeof (r as { platform?: string | null }).platform === "string"
      ? (r as { platform: string }).platform.trim().toLowerCase()
      : "";
    if (p === "ios") iosTokens.push(t);
    else androidTokens.push(t);
  }
  const androidUnique = [...new Set(androidTokens)];
  const iosUnique = [...new Set(iosTokens)];
  const totalTargets = androidUnique.length + iosUnique.length;

  if (totalTargets === 0) {
    const empty: FcmSendResult = {
      ok: true,
      sent: 0,
      failureCount: 0,
      invalidTokenRemovalCount: 0,
      errors: [],
    };
    console.log("[push] FCM send result", {
      ...empty,
      reason: "no_device_tokens_for_recipients",
      recipientUserCount: uniqueUsers.length,
    });
    return empty;
  }

  const messaging = getMessaging(app);
  const dataPayload: Record<string, string> = { ...input.data };
  const apnsCollapseId = resolveApnsCollapseId(input.apnsCollapseId);
  const apns = buildApnsAlertConfig({
    title: input.title,
    body: input.body,
    apnsCollapseId,
  });

  /**
   * iOS: send `data` + explicit APNs alert only. Combining top-level `notification` with a custom
   * `apns.payload.aps` has led to FCM/APNs rejecting or dropping messages (push “dead” on device).
   * Android: classic notification + data + high priority.
   */
  const androidMessage = {
    notification: { title: input.title, body: input.body },
    data: dataPayload,
    android: { priority: "high" as const },
  };
  const iosMessage = {
    data: dataPayload,
    apns,
  };

  let sent = 0;
  const invalid: string[] = [];
  const errors: Array<{ code: string; message?: string }> = [];

  const handleResponses = (
    res: {
      responses: Array<{
        success: boolean;
        messageId?: string;
        error?: { code?: string; message?: string };
      }>;
    },
    chunk: string[],
    platformLabel: "android" | "ios",
    chunkIndex: number
  ): void => {
    res.responses.forEach((r, idx) => {
      const token = chunk[idx];
      const tokenTail = token && token.length > 12 ? token.slice(-12) : token;
      if (r.success) {
        if (logFcmPayload) {
          console.log("[push] FCM token_accepted", {
            platform: platformLabel,
            chunkIndex,
            idx,
            tokenTail,
            messageId: r.messageId,
          });
        }
        return;
      }
      const code = r.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        if (token) invalid.push(token);
      } else {
        const message = r.error?.message;
        errors.push({ code: code || "(unknown)", message });
        console.warn("[push] FCM send error:", code, message, { tokenTail, platform: platformLabel });
      }
    });
  };

  const chunkSize = 500;
  let chunkIdx = 0;
  for (let i = 0; i < androidUnique.length; i += chunkSize) {
    const chunk = androidUnique.slice(i, i + chunkSize);
    pushTiming("fcm_before_firebase_send", { tokenCount: chunk.length, chunkIndex: chunkIdx, platform: "android" });
    if (logFcmPayload) {
      console.log("[push] fcm_multicast_template", {
        platform: "android",
        chunkIndex: chunkIdx,
        tokenCount: chunk.length,
        notification: androidMessage.notification,
        dataKeys: Object.keys(dataPayload),
        android: androidMessage.android,
      });
    }
    const resA = await messaging.sendEachForMulticast({
      tokens: chunk,
      ...androidMessage,
    });
    pushTiming("fcm_after_firebase_send", {
      successCount: resA.successCount,
      failureCount: resA.failureCount,
      chunkIndex: chunkIdx,
      platform: "android",
    });
    sent += resA.successCount;
    handleResponses(resA, chunk, "android", chunkIdx);
    chunkIdx += 1;
  }
  for (let i = 0; i < iosUnique.length; i += chunkSize) {
    const chunk = iosUnique.slice(i, i + chunkSize);
    pushTiming("fcm_before_firebase_send", { tokenCount: chunk.length, chunkIndex: chunkIdx, platform: "ios" });
    if (logFcmPayload) {
      console.log("[push] fcm_multicast_template", {
        platform: "ios",
        chunkIndex: chunkIdx,
        tokenCount: chunk.length,
        dataKeys: Object.keys(dataPayload),
        apnsHeaders: apns.headers,
        apnsPayloadAps: apns.payload?.aps,
      });
    }
    const resI = await messaging.sendEachForMulticast({
      tokens: chunk,
      ...iosMessage,
    });
    pushTiming("fcm_after_firebase_send", {
      successCount: resI.successCount,
      failureCount: resI.failureCount,
      chunkIndex: chunkIdx,
      platform: "ios",
    });
    sent += resI.successCount;
    handleResponses(resI, chunk, "ios", chunkIdx);
    chunkIdx += 1;
  }

  if (invalid.length > 0) {
    await deleteInvalidTokens(supabase, invalid);
  }

  const failureCount = totalTargets - sent;
  const result: FcmSendResult = {
    ok: true,
    sent,
    failureCount,
    invalidTokenRemovalCount: invalid.length,
    errors,
  };
  console.log("[push] FCM send result", {
    success: true,
    sent: result.sent,
    failureCount: result.failureCount,
    invalidTokenRemovalCount: result.invalidTokenRemovalCount,
    tokenCount: totalTargets,
    androidTokenCount: androidUnique.length,
    iosTokenCount: iosUnique.length,
    recipientUserCount: uniqueUsers.length,
    errors: result.errors,
  });
  return result;
}
