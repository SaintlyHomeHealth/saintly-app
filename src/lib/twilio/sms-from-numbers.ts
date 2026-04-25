/**
 * Saintly global outbound SMS identity: +1 480-360-0008 is the default; +1 480-571-2062 is backup only.
 * Import from server or client; no server-only.
 */

export const SAINTLY_PRIMARY_SMS_E164 = "+14803600008";
export const SAINTLY_BACKUP_SMS_E164 = "+14805712062";

/** @internal persisted on `conversations.metadata` when a user explicitly chose a non-primary sender in the Text-from UI. */
export const SMS_OUTBOUND_FROM_EXPLICIT_KEY = "sms_outbound_from_explicit" as const;

function digitsOnly(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : "";
}

export function getPrimarySmsFromNumber(): { e164: string; nanpDisplay: string } {
  return { e164: SAINTLY_PRIMARY_SMS_E164, nanpDisplay: "(480) 360-0008" };
}

export function getBackupSmsFromNumber(): { e164: string; nanpDisplay: string } {
  return { e164: SAINTLY_BACKUP_SMS_E164, nanpDisplay: "(480) 571-2062" };
}

/** True for our Twilio backup / alternate long code (E.164 or common variants). */
export function isSaintlyBackupSmsE164(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw);
  return d === "14805712062" || d === "4805712062";
}

export function isSaintlyPrimarySmsE164(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw);
  return d === "14803600008" || d === "4803600008";
}

function readExplicitFlag(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const v = (meta as Record<string, unknown>)[SMS_OUTBOUND_FROM_EXPLICIT_KEY];
  return v === true;
}

/**
 * When loading `conversations.preferred_from_e164` for outbound sends: honor backup (alt) only if the
 * user explicitly locked it in the Text-from bar (metadata flag). Primary and all other allowlisted
 * DIDs are honored without this flag.
 */
export function shouldHonorThreadPreferredFromE164(
  allowlistedE164: string | undefined,
  metadata: unknown
): boolean {
  if (!allowlistedE164) return false;
  if (isSaintlyBackupSmsE164(allowlistedE164)) {
    return readExplicitFlag(metadata);
  }
  return true;
}

export function logAltSmsSenderUsed(
  message: "ALT SMS sender used intentionally" = "ALT SMS sender used intentionally",
  context?: Record<string, unknown>
): void {
  if (context && Object.keys(context).length > 0) {
    console.warn(message, context);
  } else {
    console.warn(message);
  }
}

/**
 * Default `From` / Messaging Service SID for Twilio SMS when `sendSms` has no `fromOverride`.
 * Messaging Service SIDs are passed through. A misconfigured `TWILIO_SMS_FROM` pointing at the
 * backup long code is normalized to the primary line.
 */
export function resolveDefaultTwilioSmsFromOrMsid(): string {
  const env = process.env.TWILIO_SMS_FROM?.trim() ?? "";
  if (env.startsWith("MG")) {
    return env;
  }
  if (!env) {
    return getPrimarySmsFromNumber().e164;
  }
  if (isSaintlyBackupSmsE164(env)) {
    return getPrimarySmsFromNumber().e164;
  }
  return env;
}
