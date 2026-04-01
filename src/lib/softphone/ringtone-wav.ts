/** In-memory WAV for softphone ringtone (no static asset); client-only via blob URL. */

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}

/** Short ring-like tone (~0.4s) suitable for looping as incoming ring. */
export function createRingtoneObjectUrl(): { url: string; revoke: () => void } {
  const sampleRate = 44100;
  const durationSec = 0.4;
  const samples = Math.floor(sampleRate * durationSec);
  const bitsPerSample = 16;
  const numChannels = 1;
  const dataSize = samples * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.abs(Math.sin(2 * Math.PI * 2.5 * t));
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.22 * envelope;
    view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
  }
  const blob = new Blob([buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
