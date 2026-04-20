import "server-only";

import { randomUUID } from "crypto";

import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildApnsAlertConfig } from "@/lib/push/fcm-apns-alert";
import {
  fcmSmsPushDeployFingerprint,
  shouldLogIosSmsFcmDetails,
} from "@/lib/push/fcm-sms-push-diagnostics";
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
    console.log("[push-debug] abort before token load: firebase admin not initialized");
    console.warn("[push] FCM send skipped", { reason: "firebase_admin_not_initialized" });
    return { ok: false, error: "missing FIREBASE_SERVICE_ACCOUNT_JSON" };
  }
  const timing = process.env.SMS_PUSH_TIMING === "1";
  const logIosDetail = shouldLogIosSmsFcmDetails();
  const logFcmPayload = logIosDetail;
  const pushTiming = (phase: string, detail?: Record<string, unknown>) => {
    if (!timing) return;
    console.log("[PUSH]", phase, Date.now(), detail ?? {});
  };

  const uniqueUsers = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUsers.length === 0) {
    console.log("[push-debug] skipping send: no recipient user ids");
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
  let tokenQuery = supabase
    .from("user_push_devices")
    .select("user_id, fcm_token, platform, device_install_id")
    .in("user_id", uniqueUsers);
  if (input.recipientPlatforms?.length) {
    tokenQuery = tokenQuery.in("platform", input.recipientPlatforms);
  }
  const { data: rows, error } = await tokenQuery;
  pushTiming("fcm_after_load_tokens", { rowCount: (rows ?? []).length });
  console.log("[push-debug] user_push_devices rows", (rows ?? []).length);
  if (input.recipientPlatforms?.length) {
    console.log("[push-debug] recipientPlatforms filter active", input.recipientPlatforms);
  }

  if (error) {
    console.log("[push-debug] user_push_devices query failed", error.message);
    console.warn("[push] load user_push_devices:", error.message);
    return { ok: false, error: error.message };
  }

  type PushDeviceRow = {
    user_id?: string;
    fcm_token?: string | null;
    platform?: string | null;
    device_install_id?: string | null;
  };

  const androidTokens: string[] = [];
  const iosTokens: string[] = [];
  let rowsMissingPlatform = 0;
  const rowDiagnostics: Array<{
    userIdTail: string;
    platform: string | null;
    tokenTail: string;
    deviceInstallIdSet: boolean;
  }> = [];

  for (const r of (rows ?? []) as PushDeviceRow[]) {
    const t = typeof r.fcm_token === "string" ? r.fcm_token.trim() : "";
    if (!t) continue;
    const rawP = typeof r.platform === "string" ? r.platform.trim().toLowerCase() : "";
    const p = rawP === "ios" || rawP === "android" ? rawP : "";
    const uid = typeof r.user_id === "string" ? r.user_id : "";
    if (!p) {
      rowsMissingPlatform += 1;
      console.warn("[push] user_push_devices row missing/invalid platform (treated as android FCM shape)", {
        userIdTail: uid.length > 8 ? uid.slice(-8) : uid || "(none)",
        tokenTail: t.length > 12 ? t.slice(-12) : t,
        rawPlatform: r.platform ?? null,
      });
    }
    if (logIosDetail && rowDiagnostics.length < 50) {
      rowDiagnostics.push({
        userIdTail: uid.length > 8 ? uid.slice(-8) : uid || "(none)",
        platform: p || null,
        tokenTail: t.length > 12 ? t.slice(-12) : t,
        deviceInstallIdSet: Boolean(
          typeof r.device_install_id === "string" && r.device_install_id.trim()
        ),
      });
    }
    if (p === "ios") iosTokens.push(t);
    else androidTokens.push(t);
  }

  if (logIosDetail && rowDiagnostics.length > 0) {
    console.log("[push] user_push_devices snapshot (cap 50 rows)", {
      deploy: fcmSmsPushDeployFingerprint(),
      rowCount: (rows ?? []).length,
      rowsMissingPlatform,
      rows: rowDiagnostics,
    });
  }
  const androidUnique = [...new Set(androidTokens)];
  const iosUnique = [...new Set(iosTokens)];
  const totalTargets = androidUnique.length + iosUnique.length;
  console.log("[push-debug] tokens after filter", totalTargets);
  if ((rows ?? []).length > 0 && totalTargets === 0) {
    console.log("[push-debug] rows present but zero tokens (check platform / empty fcm_token)", {
      rawRowCount: (rows ?? []).length,
      rowsMissingPlatform,
    });
  }

  if (totalTargets === 0) {
    console.log("[push-debug] NO TOKENS → skipping send");
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

  console.log("[push-debug] proceeding to FCM send");

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
        if (logIosDetail && platformLabel === "ios") {
          console.log("[push] ios_fcm_firebase_accepted", {
            deploy: fcmSmsPushDeployFingerprint(),
            chunkIndex,
            idx,
            platform: platformLabel,
            tokenTail,
            messageId: r.messageId ?? null,
          });
        } else if (logFcmPayload && platformLabel === "android") {
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
      if (platformLabel === "ios") {
        console.warn("[push] ios_fcm_firebase_rejected", {
          deploy: fcmSmsPushDeployFingerprint(),
          chunkIndex,
          idx,
          tokenTail,
          errorCode: code || "(unknown)",
          errorMessage: r.error?.message,
        });
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          if (token) invalid.push(token);
        } else {
          errors.push({ code: code || "(unknown)", message: r.error?.message });
        }
        return;
      }
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
  if (iosUnique.length > 0) {
    console.log("[push] ios_fcm_batches_queued", {
      deploy: fcmSmsPushDeployFingerprint(),
      iosTokenCount: iosUnique.length,
      hasTopLevelNotification: false,
      apnsPushType: apns.headers?.["apns-push-type"] ?? null,
      apnsPriority: apns.headers?.["apns-priority"] ?? null,
      hint: "Set SAINTLY_LOG_IOS_SMS_FCM=1 for full pre-send payload + per-token messageId logs.",
    });
  }

  for (let i = 0; i < iosUnique.length; i += chunkSize) {
    const chunk = iosUnique.slice(i, i + chunkSize);
    pushTiming("fcm_before_firebase_send", { tokenCount: chunk.length, chunkIndex: chunkIdx, platform: "ios" });
    const apsAlert =
      apns.payload?.aps &&
      typeof apns.payload.aps === "object" &&
      apns.payload.aps !== null &&
      "alert" in apns.payload.aps
        ? (apns.payload.aps as { alert?: { title?: string; body?: string } }).alert
        : undefined;
    const iosPayloadBeforeSend = {
      deploy: fcmSmsPushDeployFingerprint(),
      chunkIndex: chunkIdx,
      tokenCount: chunk.length,
      tokenTailsSample: chunk.slice(0, 5).map((tok) => (tok.length > 12 ? tok.slice(-12) : tok)),
      /** FCM: must omit top-level `notification` for this iOS path (platform-split sender). */
      hasTopLevelNotification: false as const,
      apnsHeadersApnsPushType: apns.headers?.["apns-push-type"] ?? null,
      apnsHeadersApnsPriority: apns.headers?.["apns-priority"] ?? null,
      apnsHeadersApnsCollapseId: apns.headers?.["apns-collapse-id"] ?? null,
      apnsPayloadApsAlertTitle: apsAlert && typeof apsAlert.title === "string" ? apsAlert.title : null,
      apnsPayloadApsAlertBody: apsAlert && typeof apsAlert.body === "string" ? apsAlert.body : null,
      apnsPayloadApsSound:
        apns.payload?.aps &&
        typeof apns.payload.aps === "object" &&
        apns.payload.aps !== null &&
        "sound" in apns.payload.aps
          ? (apns.payload.aps as { sound?: unknown }).sound
          : null,
      dataKeyCount: Object.keys(dataPayload).length,
      dataKeys: Object.keys(dataPayload),
      dataPayload,
      fullApnsConfigForAdminSdk: {
        headers: { ...apns.headers },
        payload: apns.payload,
      },
    };
    if (logIosDetail) {
      console.log("[push] ios_sms_fcm_multicast_payload_before_send", iosPayloadBeforeSend);
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
    if (logIosDetail) {
      console.log("[push] ios_sms_fcm_multicast_batch_result", {
        deploy: fcmSmsPushDeployFingerprint(),
        chunkIndex: chunkIdx,
        successCount: resI.successCount,
        failureCount: resI.failureCount,
      });
    }
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
    deploy: fcmSmsPushDeployFingerprint(),
    sent: result.sent,
    failureCount: result.failureCount,
    invalidTokenRemovalCount: result.invalidTokenRemovalCount,
    tokenCount: totalTargets,
    androidTokenCount: androidUnique.length,
    iosTokenCount: iosUnique.length,
    userPushDevicesRowsMissingPlatform: rowsMissingPlatform,
    recipientUserCount: uniqueUsers.length,
    errors: result.errors,
  });
  return result;
}
