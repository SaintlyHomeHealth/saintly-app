import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";
import {
  parseLiveTranscriptEntriesFromMetadata,
  readUnclampedLiveTranscriptExcerpt,
  type LiveTranscriptEntry,
  type LiveTranscriptSpeaker,
} from "@/lib/phone/live-transcript-entries";

function labelForSpeaker(
  speaker: LiveTranscriptSpeaker,
  callerLabel: string
): string {
  if (speaker === "staff") return "You";
  if (speaker === "caller") return callerLabel.trim() || "Caller";
  if (speaker === "agent") return "Assistant";
  return "Speaker";
}

/**
 * Plain-text transcript for AI post-call tools (one line per utterance, speaker-prefixed).
 * Prefers `live_transcript_entries`; falls back to rolling excerpt lines.
 */
export function buildTranscriptPlainTextForOperations(
  voiceAi: CallContextVoiceAi | null | undefined,
  options?: { callerLabel?: string }
): string {
  const callerLabel = (options?.callerLabel ?? "Caller").trim() || "Caller";
  const entries = voiceAi?.live_transcript_entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const sorted = [...(entries as LiveTranscriptEntry[])].sort((a, b) => {
      const aw = a.speaker === "agent" ? 1 : 0;
      const bw = b.speaker === "agent" ? 1 : 0;
      if (aw !== bw) return aw - bw;
      return a.seq - b.seq;
    });
    const lines: string[] = [];
    for (const e of sorted) {
      const text = (e.text ?? "").trim();
      if (!text) continue;
      const who = labelForSpeaker(e.speaker, callerLabel);
      lines.push(`${who}: ${text}`);
    }
    if (lines.length > 0) return lines.join("\n\n");
  }
  const ex = voiceAi?.live_transcript_excerpt?.trim();
  if (ex) {
    return ex
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

/** Server-side: read `metadata.voice_ai` from a phone_calls row and build the same plain text as the client. */
export function buildTranscriptPlainTextFromPhoneMetadata(
  metadata: Record<string, unknown> | null | undefined,
  options?: { callerLabel?: string }
): string {
  const va = metadata?.voice_ai;
  const entries = parseLiveTranscriptEntriesFromMetadata(va);
  const excerpt = readUnclampedLiveTranscriptExcerpt(va);
  const voiceAi = {
    live_transcript_entries: entries.length > 0 ? entries : null,
    live_transcript_excerpt: excerpt,
  } as CallContextVoiceAi;
  return buildTranscriptPlainTextForOperations(voiceAi, options);
}
