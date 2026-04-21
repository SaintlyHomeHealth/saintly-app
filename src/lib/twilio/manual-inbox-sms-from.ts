import {
  buildSoftphoneOutboundAllowlist,
  loadSoftphoneOutboundCallerConfigFromEnv,
} from "@/lib/softphone/outbound-caller-ids";
import { isValidE164 } from "@/lib/softphone/phone-number";

export type ManualInboxFromResolution =
  | { fromOverride: string; source: "explicit" }
  | {
      fromOverride: undefined;
      source: "not_provided" | "no_softphone_config" | "invalid_e164" | "not_allowlisted";
    };

/**
 * Resolves optional workspace inbox "Text from" E.164 for manual sends.
 * When unset or invalid, callers should fall back to `TWILIO_SMS_FROM` / Messaging Service (unchanged).
 * Allowlist matches workspace softphone outbound lines (`TWILIO_SOFTPHONE_*` env).
 */
export function resolveManualInboxSmsFromOverride(raw: string | null | undefined): ManualInboxFromResolution {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { fromOverride: undefined, source: "not_provided" };
  }

  const config = loadSoftphoneOutboundCallerConfigFromEnv();
  if (!config) {
    return { fromOverride: undefined, source: "no_softphone_config" };
  }

  if (!isValidE164(trimmed)) {
    return { fromOverride: undefined, source: "invalid_e164" };
  }

  const allow = buildSoftphoneOutboundAllowlist(config);
  if (!allow.has(trimmed)) {
    return { fromOverride: undefined, source: "not_allowlisted" };
  }

  return { fromOverride: trimmed, source: "explicit" };
}
