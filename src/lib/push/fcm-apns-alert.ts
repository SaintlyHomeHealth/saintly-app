import type { ApnsConfig } from "firebase-admin/messaging";

/**
 * APNs alert payload for FCM HTTP v1. Background/quit display requires a real `aps.alert`; relying
 * only on FCM's top-level `notification` merge into APNs can fail to show banners when the app is
 * not foregrounded (while foreground may still work via client presentation / `onMessage`).
 */
export function buildApnsAlertConfig(input: {
  title: string;
  body: string;
  apnsCollapseId: string;
}): ApnsConfig {
  return {
    headers: {
      "apns-priority": "10",
      "apns-push-type": "alert",
      "apns-collapse-id": input.apnsCollapseId,
    },
    payload: {
      aps: {
        alert: {
          title: input.title,
          body: input.body,
        },
        sound: "default",
      },
    },
  };
}
