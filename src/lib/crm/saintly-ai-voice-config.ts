/**
 * Saintly CRM voice + Realtime AI feature flags and cost defaults.
 * OPENAI usage is pay-as-you-go; keep server flags to disable spend instantly.
 */

const DEFAULT_EXTRACTION_CHAT_MODEL = "gpt-4o-mini";
/** OpenAI Speech-to-text; `whisper-1` fallback is enforced in `/api/admin/crm/tasks/voice-capture`. */
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

export function isSaintlyRealtimeAiPublicEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SAINTLY_REALTIME_AI_ENABLED?.trim() === "true";
}

/** Server must agree before minting ephemeral Realtime credentials or exposing tool routes. */
export function isSaintlyRealtimeAiServerEnabled(): boolean {
  return process.env.SAINTLY_REALTIME_AI_ENABLED?.trim() === "true";
}

/**
 * Requires dual flags (`NEXT_PUBLIC_…` + server). On **Vercel production**, callers must also set
 * `SAINTLY_REALTIME_ALLOW_VERCEL_PRODUCTION=true` — keeps preview/staging iterative while prod ships voice-only-first.
 */
export function isSaintlyRealtimeAiEnabledRuntime(): boolean {
  if (!isSaintlyRealtimeAiPublicEnabled()) return false;
  if (!isSaintlyRealtimeAiServerEnabled()) return false;
  const ve = process.env.VERCEL_ENV?.trim();
  if (ve === "production") {
    return process.env.SAINTLY_REALTIME_ALLOW_VERCEL_PRODUCTION?.trim() === "true";
  }
  return true;
}

export type SaintlyRealtimeGatewayClientSnapshot = {
  enabled: boolean;
  max_session_ms: number;
  inactivity_ms: number;
};

/** Passed from Route Handlers/layouts — matches server-backed session limits rather than inferred env in the bundle. */
export function getSaintlyRealtimeGatewayClientSnapshot(): SaintlyRealtimeGatewayClientSnapshot {
  return {
    enabled: isSaintlyRealtimeAiEnabledRuntime(),
    max_session_ms: saintlyRealtimeMaxSessionMs(),
    inactivity_ms: saintlyRealtimeInactivityMs(),
  };
}

export function saintlyCrmTaskExtractionModel(): string {
  return process.env.SAINTLY_CRM_TASK_EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_CHAT_MODEL;
}

/** First-attempt transcription model for voice-to-task uploads. */
export function saintlyCrmTranscriptionModelPreferred(): string {
  return process.env.SAINTLY_CRM_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

const DEFAULT_REALTIME_MODEL = "gpt-4o-mini-realtime-preview-2024-12-17";

export function saintlyRealtimeModel(): string {
  return process.env.SAINTLY_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
}

export function saintlyRealtimeMaxSessionMs(): number {
  const raw = process.env.SAINTLY_REALTIME_MAX_SESSION_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 30_000 && n <= 600_000) return n;
  return 180_000;
}

export function saintlyRealtimeInactivityMs(): number {
  const raw = process.env.SAINTLY_REALTIME_INACTIVITY_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 10_000 && n <= 300_000) return n;
  return 45_000;
}

export function saintlyRealtimeMaxOutputTokens(): number {
  const raw = process.env.SAINTLY_REALTIME_MAX_OUTPUT_TOKENS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 64 && n <= 4096) return n;
  return 900;
}

export function saintlyVoiceTaskMaxUploadBytes(): number {
  const raw = process.env.SAINTLY_CRM_VOICE_MAX_AUDIO_BYTES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 100_000 && n <= 25_000_000) return n;
  return 6_000_000;
}
