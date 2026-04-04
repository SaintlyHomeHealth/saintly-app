/**
 * Twilio Recording REST URLs without a media format often return JSON metadata, not audio.
 * Playback must request a concrete format (typically .mp3).
 */
export function normalizeTwilioRecordingMediaUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/\.(mp3|wav)$/i.test(trimmed)) return trimmed;
  const withoutJson = trimmed.replace(/\.json$/i, "");
  return `${withoutJson}.mp3`;
}
