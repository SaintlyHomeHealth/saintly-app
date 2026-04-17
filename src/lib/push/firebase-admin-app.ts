import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let cached: App | null | undefined;

function logEnvServiceAccountIdentity(json: Record<string, unknown>, label: string) {
  const project_id = typeof json.project_id === "string" ? json.project_id : undefined;
  const client_email = typeof json.client_email === "string" ? json.client_email : undefined;
  console.log("[firebase-admin]", label, {
    project_id: project_id ?? "(missing)",
    client_email: client_email ?? "(missing)",
  });
}

function logAppOptions(app: App, label: string) {
  const projectId = app.options.projectId;
  console.log("[firebase-admin]", label, {
    app_options_projectId: projectId ?? "(unknown)",
  });
}

/**
 * Firebase Admin for FCM HTTP v1 (server-side only).
 * Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON string of a service account
 * that has Firebase Cloud Messaging API enabled.
 *
 * No other env vars or credential fallbacks are used. If another module had already
 * called `initializeApp` in the same process, the first registered app is reused (see logs).
 */
export function getFirebaseAdminApp(): App | null {
  if (cached !== undefined) {
    return cached;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.log("[firebase-admin] not configured", { hasEnv: false });
    cached = null;
    return null;
  }
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    logEnvServiceAccountIdentity(json, "env_json_identity");

    if (getApps().length > 0) {
      const existing = getApps()[0]!;
      logAppOptions(existing, "reusing_existing_firebase_app");
      const envPid = typeof json.project_id === "string" ? json.project_id : undefined;
      const appPid = existing.options.projectId;
      if (envPid && appPid && envPid !== appPid) {
        console.warn("[firebase-admin] env project_id does not match existing app projectId", {
          env_project_id: envPid,
          existing_app_projectId: appPid,
        });
      }
      cached = existing;
      return cached;
    }
    cached = initializeApp({
      credential: cert(json as Parameters<typeof cert>[0]),
    });
    logAppOptions(cached, "initialized_new_firebase_app");
    return cached;
  } catch (e) {
    console.warn("[firebase-admin] init failed:", e);
    cached = null;
    return null;
  }
}
