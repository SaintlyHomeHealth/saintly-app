import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";
import type { LiveTranscriptEntry, LiveTranscriptSpeaker } from "@/lib/phone/live-transcript-entries";

export type TranscriptSpeaker = "saintly" | "caller" | "unknown";

export type TranscriptBubble = {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
};

const SAINTLY_LABEL = "Saintly Home Health";

/** Public labels for UI (not stored in DB). */
export function transcriptSpeakerLabel(speaker: TranscriptSpeaker, callerLabel: string): string {
  if (speaker === "saintly") return SAINTLY_LABEL;
  if (speaker === "unknown") return "Speaker";
  return callerLabel.trim() || "Caller";
}

function mapLiveSpeaker(s: LiveTranscriptSpeaker): TranscriptSpeaker {
  if (s === "agent") return "saintly";
  if (s === "caller") return "caller";
  return "unknown";
}

/**
 * Live conversation bubbles: prefer incremental `live_transcript_entries` from the bridge.
 * Falls back to splitting `live_transcript_excerpt` when entries are empty (legacy).
 *
 * Does not use AI summary / recommended_action as chat lines — those are advisory only.
 */
export function buildTranscriptMessages(voiceAi: CallContextVoiceAi | null): TranscriptBubble[] {
  const out: TranscriptBubble[] = [];
  if (!voiceAi) return out;

  const entries = voiceAi.live_transcript_entries;
  if (Array.isArray(entries) && entries.length > 0) {
    for (const e of entries as LiveTranscriptEntry[]) {
      const id = `e-${e.seq}`;
      const speaker = mapLiveSpeaker(e.speaker);
      const text = (e.text ?? "").trim();
      if (!text) continue;
      out.push({ id, speaker, text });
    }
    return out;
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

/** AI classification / summary blocks (separate from live conversation). */
export function buildTranscriptAiNotes(voiceAi: CallContextVoiceAi | null): { id: string; title: string; text: string }[] {
  const out: { id: string; title: string; text: string }[] = [];
  if (!voiceAi) return out;
  if (voiceAi.short_summary?.trim()) {
    out.push({ id: "summary", title: "AI summary", text: voiceAi.short_summary.trim() });
  }
  if (voiceAi.recommended_action?.trim()) {
    out.push({ id: "action", title: "Suggested action", text: voiceAi.recommended_action.trim() });
  }
  return out;
}
