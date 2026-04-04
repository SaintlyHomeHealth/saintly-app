/** Read voicemail + voice AI fields from phone_calls.metadata for workspace UI. */

export type VoicemailTranscriptionUi = {
  text: string | null;
  status: string | null;
  source: string | null;
  error: string | null;
};

export function voicemailTranscriptionUiFromMeta(meta: unknown): VoicemailTranscriptionUi {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  const vt = m?.voicemail_transcription;
  if (!vt || typeof vt !== "object" || Array.isArray(vt)) {
    return { text: null, status: null, source: null, error: null };
  }
  const o = vt as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const err = typeof o.error === "string" ? o.error.trim() : "";
  return {
    text: text || null,
    status: typeof o.status === "string" ? o.status : null,
    source: typeof o.source === "string" ? o.source : null,
    error: err || null,
  };
}

/** Backward-compatible: transcript text only. */
export function voicemailTranscriptFromMeta(meta: unknown): string | null {
  return voicemailTranscriptionUiFromMeta(meta).text;
}

export function voiceAiShortSummaryFromMeta(meta: unknown): string | null {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  const va = m?.voice_ai;
  if (!va || typeof va !== "object" || Array.isArray(va)) return null;
  const s =
    typeof (va as { short_summary?: unknown }).short_summary === "string"
      ? (va as { short_summary: string }).short_summary.trim()
      : "";
  return s || null;
}
