import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";
import type { LiveTranscriptEntry, LiveTranscriptSpeaker } from "@/lib/phone/live-transcript-entries";

export type TranscriptSpeaker = "saintly" | "caller" | "local" | "unknown";

export type TranscriptBubble = {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  /** ISO 8601 from live entries when available */
  ts?: string;
};

const SAINTLY_LABEL = "Saintly Home Health";

export type TranscriptLabelOptions = {
  /**
   * When true, the remote PSTN side is always labeled "Caller" (not the workspace line / mis-attributed CLI).
   */
  softphoneTranscript?: boolean;
};

/** Public labels for UI (not stored in DB). */
export function transcriptSpeakerLabel(
  speaker: TranscriptSpeaker,
  callerLabel: string,
  opts?: TranscriptLabelOptions
): string {
  if (speaker === "saintly") return SAINTLY_LABEL;
  if (speaker === "local") return "You";
  if (speaker === "unknown") return "Speaker";
  if (opts?.softphoneTranscript && speaker === "caller") return "Caller";
  return callerLabel.trim() || "Caller";
}

function mapLiveSpeaker(s: LiveTranscriptSpeaker): TranscriptSpeaker {
  if (s === "agent") return "saintly";
  if (s === "caller") return "caller";
  if (s === "staff") return "local";
  return "unknown";
}

export type BuildTranscriptMessagesOptions = {
  /**
   * Softphone live transcript: show only real human legs (staff + caller). Assistant/agent lines
   * belong in {@link buildSoftphoneAssistantDebugEntries} or AI notes — not the main thread.
   */
  humanSpeechOnly?: boolean;
};

function isHumanSpeechEntry(s: LiveTranscriptSpeaker): boolean {
  return s === "staff" || s === "caller";
}

/**
 * Assistant / system lines from the media bridge (speaker=agent), for optional debug UI only.
 */
export function buildSoftphoneAssistantDebugEntries(voiceAi: CallContextVoiceAi | null): TranscriptBubble[] {
  const out: TranscriptBubble[] = [];
  if (!voiceAi) return out;
  const entries = voiceAi.live_transcript_entries;
  if (!Array.isArray(entries) || entries.length === 0) return out;
  const sorted = [...(entries as LiveTranscriptEntry[])].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) {
    if (e.speaker !== "agent") continue;
    const id = `dbg-${e.seq}`;
    const speaker = mapLiveSpeaker(e.speaker);
    const text = (e.text ?? "").trim();
    if (!text) continue;
    out.push({ id, speaker, text, ts: e.ts });
  }
  return out;
}

/**
 * Live conversation bubbles: prefer incremental `live_transcript_entries` from the bridge.
 * Falls back to splitting `live_transcript_excerpt` when entries are empty (legacy).
 *
 * Does not use AI summary / recommended_action as chat lines — those are advisory only.
 */
export function buildTranscriptMessages(
  voiceAi: CallContextVoiceAi | null,
  opts?: BuildTranscriptMessagesOptions
): TranscriptBubble[] {
  const out: TranscriptBubble[] = [];
  if (!voiceAi) return out;

  const humanOnly = Boolean(opts?.humanSpeechOnly);

  const entries = voiceAi.live_transcript_entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const sorted = [...(entries as LiveTranscriptEntry[])].sort((a, b) => {
      const aw = a.speaker === "agent" ? 1 : 0;
      const bw = b.speaker === "agent" ? 1 : 0;
      if (aw !== bw) return aw - bw;
      return a.seq - b.seq;
    });
    for (const e of sorted) {
      if (humanOnly && !isHumanSpeechEntry(e.speaker)) continue;
      const id = `e-${e.seq}`;
      const speaker = mapLiveSpeaker(e.speaker);
      const text = (e.text ?? "").trim();
      if (!text) continue;
      out.push({ id, speaker, text, ts: e.ts });
    }
    return out;
  }

  /** Rolling excerpt can mix assistant + humans; never use it for softphone human-only mode. */
  if (humanOnly) {
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
