import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const ACTIVE_STATUSES = ["initiated", "ringing", "in_progress"] as const;

/** Temporary verbose logs: set PHONE_LOG_INBOUND_ACTIVE=1 in Vercel to debug banner. */
const LOG_INBOUND_ACTIVE =
  process.env.PHONE_LOG_INBOUND_ACTIVE === "1" || process.env.NODE_ENV === "development";

/**
 * Candidate pool: rows with started_at >= now - queryMax (default 15m).
 * Live signal: started_at must also be within liveMax (default 10m) — emergency cut stale in-progress rows.
 * Env: INBOUND_ACTIVE_QUERY_MAX_MINUTES (1–120, default 15), INBOUND_ACTIVE_LIVE_MAX_MINUTES (1–120, default 10).
 */
function parseMinutesEnv(key: string, defaultVal: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return defaultVal;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(120, n);
}

function queryMaxMinutes(): number {
  return parseMinutesEnv("INBOUND_ACTIVE_QUERY_MAX_MINUTES", 15);
}

/** Stricter than query window — banner "live AI" should not persist past this age. */
function liveMaxMinutes(): number {
  const q = queryMaxMinutes();
  const live = parseMinutesEnv("INBOUND_ACTIVE_LIVE_MAX_MINUTES", 10);
  return Math.min(live, q);
}

function logDecision(payload: Record<string, unknown>) {
  if (!LOG_INBOUND_ACTIVE) return;
  console.log("[workspace/phone/inbound-active] DECISION", JSON.stringify(payload));
}

function metaSourceRealtime(meta: Record<string, unknown>): boolean {
  return meta.source === "twilio_voice_openai_realtime";
}

/** Post-call / voicemail pipeline signals — never show "live AI" for these. */
function hasPostCallOrVoicemailSignals(meta: Record<string, unknown>): {
  hit: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (meta.twilio_last_voicemail != null && typeof meta.twilio_last_voicemail === "object") {
    reasons.push("metadata.twilio_last_voicemail");
  }

  const vt = meta.voicemail_transcription;
  if (vt != null && typeof vt === "object") {
    const o = vt as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    const st = typeof o.status === "string" ? o.status.trim().toLowerCase() : "";
    const src = typeof o.source === "string" ? o.source.trim().toLowerCase() : "";
    if (text.length > 0) reasons.push("metadata.voicemail_transcription.text");
    if (st && ["queued", "processing", "completed", "failed"].includes(st)) {
      reasons.push(`metadata.voicemail_transcription.status=${st}`);
    }
    if (src === "saintly" || src === "twilio") reasons.push(`metadata.voicemail_transcription.source=${src}`);
    if (typeof o.queued_at === "string" && o.queued_at.trim()) reasons.push("metadata.voicemail_transcription.queued_at");
  }

  if (meta.voice_ai != null && typeof meta.voice_ai === "object") {
    reasons.push("metadata.voice_ai");
  }

  const lastCb = meta.twilio_last_callback;
  if (lastCb != null && typeof lastCb === "object") {
    const cs = (lastCb as Record<string, unknown>).CallStatus;
    if (typeof cs === "string" && cs.trim().toLowerCase() === "completed") {
      reasons.push("metadata.twilio_last_callback.CallStatus=completed");
    }
  }

  return { hit: reasons.length > 0, reasons };
}

/**
 * True when the call is still a live PSTN/AI session — not post-call voicemail capture or terminal.
 */
function rowLooksLikeLiveAiAssist(row: {
  ended_at?: string | null;
  voicemail_recording_sid?: string | null;
  voicemail_duration_seconds?: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (row.ended_at != null && String(row.ended_at).trim() !== "") {
    return { ok: false, reason: "ended_at_set" };
  }
  const vmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  if (vmSid !== "") {
    return { ok: false, reason: "voicemail_recording_sid_set" };
  }
  const vmd =
    typeof row.voicemail_duration_seconds === "number" && Number.isFinite(row.voicemail_duration_seconds)
      ? row.voicemail_duration_seconds
      : 0;
  if (vmd > 0) {
    return { ok: false, reason: "voicemail_duration_seconds_positive" };
  }
  return { ok: true };
}

function emergencyTooOld(startedAt: string | null | undefined, maxAgeMs: number): { tooOld: boolean; ageMs: number | null } {
  if (!startedAt || typeof startedAt !== "string") return { tooOld: true, ageMs: null };
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return { tooOld: true, ageMs: null };
  const ageMs = Date.now() - t;
  return { tooOld: ageMs > maxAgeMs, ageMs };
}

/**
 * Workspace staff: whether an inbound OpenAI-realtime call is currently live (AI on the line).
 * Used to drive the call dock / banner when Twilio Client is not ringing (stream-only inbound).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queryMin = queryMaxMinutes();
  const liveMin = liveMaxMinutes();
  const querySinceMs = queryMin * 60 * 1000;
  const liveMaxAgeMs = liveMin * 60 * 1000;
  const since = new Date(Date.now() - querySinceMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "id, direction, from_e164, external_call_id, status, started_at, ended_at, duration_seconds, voicemail_recording_sid, voicemail_duration_seconds, metadata"
    )
    .eq("direction", "inbound")
    .in("status", [...ACTIVE_STATUSES])
    .gte("started_at", since)
    .contains("metadata", { source: "twilio_voice_openai_realtime" })
    .is("ended_at", null)
    .or("voicemail_recording_sid.is.null,voicemail_recording_sid.eq.")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logDecision({
      final_active: false,
      gate_reason: "query_error",
      error_message: error.message,
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    if (process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbound-active]", error.message);
    }
    return NextResponse.json({ active: false }, { status: 200 });
  }

  if (!data?.external_call_id) {
    logDecision({
      final_active: false,
      gate_reason: "no_matching_row",
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  const row = data as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : row.id != null ? String(row.id) : null;
  const direction = typeof row.direction === "string" ? row.direction : null;
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  const metadataSourceIsRealtime = metaSourceRealtime(meta);
  const hasTwilioLastVoicemail = meta.twilio_last_voicemail != null && typeof meta.twilio_last_voicemail === "object";
  const postCall = hasPostCallOrVoicemailSignals(meta);

  const snapshot = {
    phone_calls_id: id,
    external_call_id: row.external_call_id,
    direction,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    voicemail_recording_sid: row.voicemail_recording_sid ?? null,
    voicemail_duration_seconds: row.voicemail_duration_seconds ?? null,
    duration_seconds: row.duration_seconds ?? null,
    metadata_source: meta.source,
    metadata_source_is_twilio_voice_openai_realtime: metadataSourceIsRealtime,
    metadata_twilio_last_voicemail_exists: hasTwilioLastVoicemail,
    post_call_metadata_signals: postCall.reasons,
  };

  if (!metadataSourceIsRealtime) {
    logDecision({
      ...snapshot,
      final_active: false,
      gate_reason: "metadata.source_not_exactly_twilio_voice_openai_realtime",
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  const gate = rowLooksLikeLiveAiAssist({
    ended_at: row.ended_at as string | null | undefined,
    voicemail_recording_sid: row.voicemail_recording_sid as string | null | undefined,
    voicemail_duration_seconds: row.voicemail_duration_seconds as number | null | undefined,
  });

  if (!gate.ok) {
    logDecision({
      ...snapshot,
      final_active: false,
      gate_reason: `column_gate:${gate.reason}`,
      post_call_metadata_signals: postCall.reasons,
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  if (hasTwilioLastVoicemail) {
    logDecision({
      ...snapshot,
      final_active: false,
      gate_reason: "metadata.twilio_last_voicemail_object_present",
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  if (postCall.hit) {
    logDecision({
      ...snapshot,
      final_active: false,
      gate_reason: "post_call_or_voicemail_metadata",
      post_call_metadata_signals: postCall.reasons,
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  const startedAt = typeof row.started_at === "string" ? row.started_at : null;
  const age = emergencyTooOld(startedAt, liveMaxAgeMs);
  if (age.tooOld) {
    logDecision({
      ...snapshot,
      final_active: false,
      gate_reason: "emergency_started_at_outside_live_window",
      age_ms: age.ageMs,
      live_max_age_ms: liveMaxAgeMs,
      query_since_iso: since,
      query_max_minutes: queryMin,
      live_max_minutes: liveMin,
    });
    return NextResponse.json({ active: false });
  }

  logDecision({
    ...snapshot,
    final_active: true,
    gate_reason: "all_checks_passed_live_ai_assist",
    age_ms: age.ageMs,
    live_max_age_ms: liveMaxAgeMs,
    query_since_iso: since,
    query_max_minutes: queryMin,
    live_max_minutes: liveMin,
  });

  return NextResponse.json({
    active: true,
    from_e164: (typeof row.from_e164 === "string" ? row.from_e164 : null) ?? null,
    external_call_id: typeof row.external_call_id === "string" ? row.external_call_id : String(row.external_call_id),
    status: typeof row.status === "string" ? row.status : null,
  });
}
