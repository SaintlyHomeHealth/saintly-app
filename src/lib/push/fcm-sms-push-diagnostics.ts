import "server-only";

/** Bump when iOS/Android FCM split or SMS path semantics change (grep logs to confirm deploy). */
export const FCM_SMS_USER_IDS_SENDER_REVISION =
  "sendFcmDataAndNotificationToUserIds:platform-split-ios-data-plus-apns-alert-v2";

/**
 * Identifies the running server build in push logs (Vercel / generic).
 * Set `SAINTLY_LOG_IOS_SMS_FCM=1` to print full iOS payload + per-token Firebase results for SMS.
 */
export function fcmSmsPushDeployFingerprint(): Record<string, string | undefined> {
  return {
    senderRevision: FCM_SMS_USER_IDS_SENDER_REVISION,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  };
}

export function shouldLogIosSmsFcmDetails(): boolean {
  return (
    process.env.SAINTLY_LOG_IOS_SMS_FCM === "1" ||
    process.env.SAINTLY_LOG_FCM_PAYLOAD === "1" ||
    process.env.SMS_PUSH_TIMING === "1"
  );
}
