import "server-only";

/**
 * Safe CRM voice batch save diagnostics (no transcript body, titles, or descriptions).
 * Values are JSON-serialized; keep nested objects free of PHI.
 */
export function logCrmVoiceSaveSafe(stage: string, fields: Record<string, unknown>) {
  console.info("[crm_voice_save]", JSON.stringify({ stage, ts: new Date().toISOString(), ...fields }));
}

export function crmLogUserSuffix(userId: string | null | undefined): string | null {
  if (!userId || userId.length < 8) return null;
  return userId.slice(-8);
}
