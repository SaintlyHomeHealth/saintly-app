import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";

export type TranscriptSpeaker = "saintly" | "caller";

export type TranscriptBubble = {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
};

const SAINTLY_LABEL = "Saintly Home Health";

/** Public labels for UI (not stored in DB). */
export function transcriptSpeakerLabel(speaker: TranscriptSpeaker, callerLabel: string): string {
  return speaker === "saintly" ? SAINTLY_LABEL : callerLabel.trim() || "Caller";
}

/**
 * Build chat bubbles from existing `voice_ai` fields (no backend change).
 * Summary + recommended action → Saintly; live excerpt lines → caller (ASR / bridge).
 */
export function buildTranscriptMessages(
  voiceAi: CallContextVoiceAi | null,
  callerLabel: string
): TranscriptBubble[] {
  const out: TranscriptBubble[] = [];
  if (!voiceAi) return out;

  if (voiceAi.short_summary?.trim()) {
    out.push({ id: "summary", speaker: "saintly", text: voiceAi.short_summary.trim() });
  }
  if (voiceAi.recommended_action?.trim()) {
    out.push({ id: "action", speaker: "saintly", text: voiceAi.recommended_action.trim() });
  }
  const ex = voiceAi.live_transcript_excerpt?.trim();
  if (ex) {
    const parts = ex.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    parts.forEach((p, i) => {
      out.push({ id: `live-${i}`, speaker: "caller", text: p });
    });
  }
  return out;
}
