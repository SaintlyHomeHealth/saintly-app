import "server-only";

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/admin";
import { buildPhoneCallAiContextBlock, fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { normalizeTwilioRecordingMediaUrl } from "@/lib/phone/twilio-recording-media";
import {
  buildVoiceAiInputFingerprint,
  getVoiceAiClassificationSystemPrompt,
  normalizeVoiceAiPayload,
  persistVoiceAiMetadata,
} from "@/lib/phone/voice-ai-background";

const SID_RE = /^RE[0-9a-f]{32}$/i;

const inflightByCallId = new Map<string, Promise<void>>();

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function hashTranscript(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 24);
}

function buildMediaUrlFromRow(row: Record<string, unknown>): string | null {
  const rawUrl = typeof row.voicemail_recording_url === "string" ? row.voicemail_recording_url.trim() : "";
  if (rawUrl) {
    return normalizeTwilioRecordingMediaUrl(rawUrl);
  }
  const sid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  if (!SID_RE.test(sid)) return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Recordings/${encodeURIComponent(sid)}.mp3`;
}

async function fetchTwilioRecordingBuffer(mediaUrl: string): Promise<Buffer | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(mediaUrl, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn("[voicemail-saintly] Twilio recording fetch", { status: res.status });
    return null;
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    console.warn("[voicemail-saintly] Twilio returned JSON instead of audio");
    return null;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function openAiWhisperTranscribe(buffer: Buffer): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" }), "voicemail.mp3");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[voicemail-saintly] whisper HTTP:", res.status, t.slice(0, 400));
    return null;
  }
  const data = (await res.json()) as { text?: string };
  const text = typeof data.text === "string" ? data.text.trim() : "";
  return text || null;
}

async function mergeVoicemailTranscriptionPatch(callId: string, patch: Record<string, unknown>): Promise<void> {
  const { data: row, error } = await supabaseAdmin.from("phone_calls").select("metadata").eq("id", callId).maybeSingle();
  if (error || !row) return;
  const prev = asRecord(row.metadata) ?? {};
  const prevVt = asRecord(prev.voicemail_transcription) ?? {};
  const nextMeta = {
    ...prev,
    voicemail_transcription: { ...prevVt, ...patch },
  };
  const { error: upErr } = await supabaseAdmin.from("phone_calls").update({ metadata: nextMeta }).eq("id", callId);
  if (upErr) {
    console.warn("[voicemail-saintly] metadata update:", upErr.message);
  }
}

async function executeSaintlyVoicemailProcessing(callId: string): Promise<void> {
  if (process.env.SAINTLY_VOICEMAIL_AI_PROCESSING === "0") return;

  const { data: raw, error } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "id, status, direction, from_e164, to_e164, started_at, ended_at, duration_seconds, primary_tag, contact_id, metadata, voicemail_recording_sid, voicemail_recording_url, voicemail_duration_seconds, priority_sms_reason, auto_reply_sms_body, contacts ( full_name, first_name, last_name )"
    )
    .eq("id", callId)
    .maybeSingle();

  if (error || !raw) {
    console.warn("[voicemail-saintly] load row:", error?.message ?? "missing");
    return;
  }

  const row = raw as Record<string, unknown>;
  const sid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  const meta = asRecord(row.metadata) ?? {};
  const vt = asRecord(meta.voicemail_transcription) ?? {};
  if (
    vt.source === "saintly" &&
    vt.status === "completed" &&
    typeof vt.recording_sid === "string" &&
    vt.recording_sid.trim() === sid &&
    sid
  ) {
    return;
  }

  const mediaUrl = buildMediaUrlFromRow(row);
  if (!mediaUrl) {
    await mergeVoicemailTranscriptionPatch(callId, {
      status: "failed",
      source: "saintly",
      error: "No voicemail recording URL or valid recording SID",
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const hasTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasTwilio || !hasOpenAi) {
    await mergeVoicemailTranscriptionPatch(callId, {
      status: "failed",
      source: "saintly",
      error: !hasOpenAi ? "OPENAI_API_KEY not configured" : "Twilio credentials not configured",
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await mergeVoicemailTranscriptionPatch(callId, {
    status: "processing",
    source: "saintly",
    updated_at: new Date().toISOString(),
    recording_sid: sid || null,
  });

  const buf = await fetchTwilioRecordingBuffer(mediaUrl);
  if (!buf || buf.length < 64) {
    await mergeVoicemailTranscriptionPatch(callId, {
      status: "failed",
      source: "saintly",
      error: "Could not download recording audio",
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const transcript = await openAiWhisperTranscribe(buf);
  if (!transcript) {
    await mergeVoicemailTranscriptionPatch(callId, {
      status: "failed",
      source: "saintly",
      error: "Transcription failed",
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const transcriptHash = hashTranscript(transcript);
  const fp = `${buildVoiceAiInputFingerprint(row)}|vmtrans:${transcriptHash}`;

  const userMessage = `Produce the voice AI classification JSON for this completed or missed call.\n\n${buildPhoneCallAiContextBlock(
    row
  )}\n\nVoicemail transcript (may be imperfect; minimize PHI in your output):\n${transcript.slice(0, 8000)}`;

  const parsed = await fetchOpenAiJsonObject(getVoiceAiClassificationSystemPrompt(), userMessage);
  const normalized = parsed
    ? normalizeVoiceAiPayload(parsed, fp, {
        source: "background",
        live_transcript_excerpt: transcript.slice(0, 500),
      })
    : null;

  if (normalized) {
    await persistVoiceAiMetadata(callId, normalized);
  }

  await mergeVoicemailTranscriptionPatch(callId, {
    status: "completed",
    source: "saintly",
    text: transcript,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1",
    updated_at: new Date().toISOString(),
    recording_sid: sid || null,
    error: null,
  });
}

export async function runSaintlyVoicemailProcessing(callId: string): Promise<void> {
  const id = callId.trim();
  if (!id) return;

  const prev = inflightByCallId.get(id);
  const chain = (async () => {
    if (prev) await prev.catch(() => {});
    await executeSaintlyVoicemailProcessing(id);
  })();

  inflightByCallId.set(id, chain);
  try {
    await chain;
  } finally {
    if (inflightByCallId.get(id) === chain) {
      inflightByCallId.delete(id);
    }
  }
}

/**
 * After Twilio recording is saved: Whisper + voice AI classification (async; does not block webhooks).
 */
export function scheduleSaintlyVoicemailProcessing(callId: string): void {
  if (process.env.SAINTLY_VOICEMAIL_AI_PROCESSING === "0") return;
  const id = callId.trim();
  if (!id) return;
  queueMicrotask(() => {
    void runSaintlyVoicemailProcessing(id).catch((e) => {
      console.warn("[voicemail-saintly] unhandled:", e);
    });
  });
}
