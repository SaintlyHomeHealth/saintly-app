import "server-only";

import {
  SAINTLY_CRM_VOICE_PHI_NOTICE_BAA_CONFIRMED,
  SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT,
} from "@/lib/crm/crm-voice-phi-copy";

/**
 * CRM voice UI primary disclosure. Driven by server env only — never `NEXT_PUBLIC_*`.
 * Default remains the PHI/BAA warning unless `SAINTLY_OPENAI_API_BAA_CONFIRMED` is explicitly `true`.
 */
export function getSaintlyCrmVoicePhiNotice(): string {
  return process.env.SAINTLY_OPENAI_API_BAA_CONFIRMED?.trim() === "true"
    ? SAINTLY_CRM_VOICE_PHI_NOTICE_BAA_CONFIRMED
    : SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT;
}
