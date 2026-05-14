/** Aggregates Twilio Voice.js `sample` events (see RTCSample). */
export type CallQualitySampleAggregate = {
  sample_count: number;
  max_packets_lost_fraction: number | null;
  max_jitter_ms: number | null;
  max_rtt_ms: number | null;
  min_mos: number | null;
  last_codec: string | null;
};

export type CallQualityWarningRecord = {
  name: string;
  at: string;
  /** Sandboxed detail — SDK objects can be large; keep primitives only when possible. */
  detail?: Record<string, unknown> | null;
};

export type CallQualityMediaDeviceSnapshot = {
  audio_inputs: { deviceId: string; label: string; groupId?: string }[];
  audio_outputs: { deviceId: string; label: string; groupId?: string }[];
};

const MEANINGFUL_WARNING_NAMES = new Set(
  [
    "ice-connectivity-lost",
    "high-packet-loss",
    "high-packets-lost-fraction",
    "high-jitter",
    "high-rtt",
    "low-mos",
    "high-mos",
    "constant-audio-input-level",
    "constant-audio-output-level",
    "audio-input-level",
    "audio-output-level",
  ].map((s) => s.toLowerCase())
);

function prefixWarnName(name: string): boolean {
  const n = name.toLowerCase();
  if (MEANINGFUL_WARNING_NAMES.has(n)) return true;
  if (n.includes("packet-loss")) return true;
  if (n.includes("one-way")) return true;
  if (n.includes("choppy")) return true;
  if (n.includes("latency")) return true;
  if (n.includes("ice")) return true;
  return false;
}

/** Returns true when the warning should surface as `console.warn` (avoids noisy false positives). */
export function shouldConsoleWarnForTwilioVoiceWarning(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes("constant-audio-output-level")) return false;
  return prefixWarnName(n);
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function createEmptySampleAggregate(): CallQualitySampleAggregate {
  return {
    sample_count: 0,
    max_packets_lost_fraction: null,
    max_jitter_ms: null,
    max_rtt_ms: null,
    min_mos: null,
    last_codec: null,
  };
}

export function foldRtcSample(
  agg: CallQualitySampleAggregate,
  sample: Record<string, unknown>,
  codecFromCall?: string | null
): CallQualitySampleAggregate {
  const next = { ...agg, sample_count: agg.sample_count + 1 };
  const plf = numOrNull(sample.packetsLostFraction);
  if (plf != null) {
    next.max_packets_lost_fraction =
      next.max_packets_lost_fraction == null ? plf : Math.max(next.max_packets_lost_fraction, plf);
  }
  const jitter = numOrNull(sample.jitter);
  if (jitter != null) {
    next.max_jitter_ms = next.max_jitter_ms == null ? jitter : Math.max(next.max_jitter_ms, jitter);
  }
  const rtt = numOrNull(sample.rtt ?? sample.roundTripTime);
  if (rtt != null) {
    next.max_rtt_ms = next.max_rtt_ms == null ? rtt : Math.max(next.max_rtt_ms, rtt);
  }
  const mos = numOrNull(sample.mos);
  if (mos != null) {
    next.min_mos = next.min_mos == null ? mos : Math.min(next.min_mos, mos);
  }
  const codec =
    typeof sample.codecName === "string" && sample.codecName.trim()
      ? sample.codecName.trim()
      : codecFromCall && codecFromCall.trim()
        ? codecFromCall.trim()
        : null;
  if (codec) next.last_codec = codec;
  return next;
}

export function sandboxWarningDetail(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ["name", "threshold", "values", "value"]) {
    if (key in o) {
      const v = o[key];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[key] = v;
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        out[key] = "[object]";
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Best-effort enumeration of audio devices (requires permissions in some browsers — may be empty before first call).
 */
export async function snapshotMediaDevices(): Promise<CallQualityMediaDeviceSnapshot | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return null;
  }
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    const audio_inputs: CallQualityMediaDeviceSnapshot["audio_inputs"] = [];
    const audio_outputs: CallQualityMediaDeviceSnapshot["audio_outputs"] = [];
    for (const d of list) {
      if (d.kind === "audioinput") {
        audio_inputs.push({ deviceId: d.deviceId, label: d.label || "(input)", groupId: d.groupId });
      } else if (d.kind === "audiooutput") {
        audio_outputs.push({ deviceId: d.deviceId, label: d.label || "(output)", groupId: d.groupId });
      }
    }
    return { audio_inputs, audio_outputs };
  } catch {
    return null;
  }
}
