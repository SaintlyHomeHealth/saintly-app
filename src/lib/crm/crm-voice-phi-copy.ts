/** Client-safe CRM voice disclosure lines (no env reads — server picks via `getSaintlyCrmVoicePhiNotice`). */

/** Strict default: shown unless `SAINTLY_OPENAI_API_BAA_CONFIRMED=true` on the server. */
export const SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT =
  "Voice AI uses OpenAI API billing. Do not speak full PHI unless Saintly has confirmed API BAA coverage.";

/** Softer line after explicit OpenAI API BAA confirmation (`SAINTLY_OPENAI_API_BAA_CONFIRMED=true`). Still reminds staff of billing + appropriate use. */
export const SAINTLY_CRM_VOICE_PHI_NOTICE_BAA_CONFIRMED =
  "Voice AI uses OpenAI API billing. Use only for authorized Saintly administrative tasks.";

/** @deprecated Prefer `SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT`. */
export const SAINTLY_CRM_VOICE_PHI_OPENAI_NOTICE = SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT;
