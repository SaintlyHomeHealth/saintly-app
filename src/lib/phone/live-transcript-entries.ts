/**
 * Incremental live transcript for softphone / Media Stream bridge (stored under `metadata.voice_ai`).
 * Separate from AI summary fields — append-only with monotonic `seq`.
 */

export type LiveTranscriptSpeaker = "caller" | "agent" | "staff" | "unknown";

export type LiveTranscriptEntry = {
  seq: number;
  speaker: LiveTranscriptSpeaker;
  text: string;
  /** ISO 8601 */
  ts: string;
};

const MAX_ENTRIES = 600;
const MAX_TEXT_PER_ENTRY = 12_000;

export function normalizeSpeaker(raw: unknown): LiveTranscriptSpeaker {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "caller" || s === "agent" || s === "staff" || s === "unknown") return s;
  return "unknown";
}

export function parseLiveTranscriptEntriesFromMetadata(voiceAiRaw: unknown): LiveTranscriptEntry[] {
  if (!voiceAiRaw || typeof voiceAiRaw !== "object" || Array.isArray(voiceAiRaw)) return [];
  const arr = (voiceAiRaw as Record<string, unknown>).live_transcript_entries;
  if (!Array.isArray(arr)) return [];
  const out: LiveTranscriptEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const seq = typeof o.seq === "number" && Number.isFinite(o.seq) ? o.seq : NaN;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    const ts = typeof o.ts === "string" ? o.ts.trim() : "";
    if (!Number.isFinite(seq) || !text || !ts) continue;
    out.push({
      seq,
      speaker: normalizeSpeaker(o.speaker),
      text: text.slice(0, MAX_TEXT_PER_ENTRY),
      ts,
    });
  }
  out.sort((a, b) => a.seq - b.seq);
  return out;
}

/** Raw excerpt from DB without admin UI clamp (workspace call-context only). */
export function readUnclampedLiveTranscriptExcerpt(voiceAiRaw: unknown): string | null {
  if (!voiceAiRaw || typeof voiceAiRaw !== "object" || Array.isArray(voiceAiRaw)) return null;
  const ex = (voiceAiRaw as Record<string, unknown>).live_transcript_excerpt;
  if (typeof ex !== "string" || !ex.trim()) return null;
  return ex.trim().slice(0, 100_000);
}

export function trimEntries(entries: LiveTranscriptEntry[]): LiveTranscriptEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  return entries.slice(entries.length - MAX_ENTRIES);
}
