import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let cached: App | null | undefined;

/**
 * Firebase Admin for FCM HTTP v1 (server-side only).
 * Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON string of a service account
 * that has Firebase Cloud Messaging API enabled.
 */
export function getFirebaseAdminApp(): App | null {
  if (cached !== undefined) {
    return cached;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (getApps().length > 0) {
      cached = getApps()[0]!;
      return cached;
    }
    cached = initializeApp({
      credential: cert(json as Parameters<typeof cert>[0]),
    });
    const projectId = typeof json.project_id === "string" ? json.project_id : undefined;
    console.log("[firebase-admin] initialized", { projectId: projectId ?? "(unknown)" });
    return cached;
  } catch (e) {
    console.warn("[firebase-admin] init failed:", e);
    cached = null;
    return null;
  }
}
