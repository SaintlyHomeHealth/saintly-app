/** Read voicemail + voice AI fields from phone_calls.metadata for workspace UI. */

export function voicemailTranscriptFromMeta(meta: unknown): string | null {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  const vt = m?.voicemail_transcription;
  if (!vt || typeof vt !== "object" || Array.isArray(vt)) return null;
  const t = typeof (vt as { text?: unknown }).text === "string" ? (vt as { text: string }).text.trim() : "";
  return t || null;
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
